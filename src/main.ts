import { plainTextInput } from "./textinput.ts";
import { createAttentionStore, spaceAttention } from "./attention/store.ts";
import { classifyClaude } from "./attention/claude.ts";
import { compileTrigger, matchTrigger, type Trigger } from "./attention/triggers.ts";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CrtRenderer,
  FONTS,
  SCHEME_IDS,
  tabColumnRects,
  tabHitAt,
  type BarSource,
} from "./crt.ts";
import {
  closePane,
  findLeaf,
  isLeaf,
  neighbor,
  paneIds,
  paneRects,
  setRatio,
  splitBars,
  splitPane,
  updateLeaf,
  type LayoutNode,
} from "./layout.ts";
import { screenToContent } from "./distortion.ts";
import {
  defaultWorkspace,
  maxPaneId,
  moveItem,
  parsePresetHandoff,
  presetSpaces,
  sanitizeWorkspace,
  snapshotPreset,
  type Preset,
  type SpaceSpec,
  type WorkspaceFile,
} from "./workspace.ts";
import { setAttention, setCfgLabel } from "./cockpit/clock.ts";
import { needsPasteConfirm, pastePreview, shellQuote, stripTrailingNewlines } from "./textutils.ts";
import { Palette, type PaletteItem } from "./palette.ts";
import { searchLines, type PaneHits } from "./globalsearch.ts";
import { GlobalSearchOverlay } from "./globalsearch-overlay.ts";
import { popClosed, pushClosed, serializeScrollback, type ClosedPane } from "./undoclose.ts";
import { sanitizeCockpit, sanitizeMode, type CockpitCfg, type Mode } from "./cockpit/config.ts";
import { effectiveVisual } from "./cockpit/skin.ts";
import { sanitizeVisual, type SavedVisual } from "./cockpit/visualcfg.ts";
import { CONFIGS_KEY, configNames, sanitizeStore, withConfig, withoutConfig, type ConfigStore } from "./configs.ts";
import { oscUrlToPath } from "./cockpit/files.ts";
import { initCockpit, type Cockpit } from "./cockpit/cockpit.ts";
import { agentRows } from "./cockpit/widgets/agents.ts";
import { DomLayer } from "./cockpit/domrender.ts";
import { sound } from "./cockpit/sound.ts";
import { ConfigScreen } from "./cockpit/configscreen.ts";
import { SnippetLib } from "./snippetlib.ts";
import { newSnippetId, sanitizeSnippets, withSnippet, type Snippet } from "./snippets.ts";
import { findShortcut } from "./shortcuts.ts";
import { ShortcutsOverlay } from "./cockpit/shortcuts-overlay.ts";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { parseWindowParams, nextWindowLabel } from "./win.ts";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import "./cockpit/cockpit.css";

const WIN = parseWindowParams(location.search);
/** PTY ids are global in the Rust map; offset per window so pane 1 here never kills pane 1 there. */
const ptyId = (id: number) => WIN.base + id;
const wsArgs = () => (WIN.win === "main" ? {} : { name: WIN.win });
/** Config this window currently saves to; starts as WIN.config, rebound by CONFIG: LOAD. */
let activeConfig: string | null = WIN.config;
/** Last preset opened in this window, for the CFG bar segment. Session-only. */
let lastPreset: string | null = null;
function refreshCfgLabel() {
  setCfgLabel(`CFG ${activeConfig ?? "default"}` + (lastPreset ? ` · ${lastPreset}` : ""));
}

type PtyEvent = { type: "data"; b64: string } | { type: "exit" };
type PasteResult =
  | { kind: "path"; path: string }
  | { kind: "text"; text: string }
  | { kind: "empty" };

interface VisualSaved extends SavedVisual {
  mode: Mode;
  ck: CockpitCfg;
}

const STORE_KEY = "phosphor-settings";

const termContainer = document.getElementById("terminal")!;
const crtCanvas = document.getElementById("crt") as HTMLCanvasElement;
const captureEl = document.getElementById("capture")!;
const paneMenuEl = document.getElementById("panemenu")!;
const presetMenuEl = document.getElementById("presetmenu")!;
const tabMenuEl = document.getElementById("tabmenu")!;

const visual: VisualSaved = (() => {
  let s: any = null;
  try {
    s = WIN.config
      ? (sanitizeStore(JSON.parse(localStorage.getItem(CONFIGS_KEY) ?? "null"))[WIN.config] ?? null)
      : JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
  } catch {}
  // sanitizeVisual also migrates a stored v3 shape, so an upgrade never
  // presents the user with a reset to defaults.
  return { ...sanitizeVisual(s), mode: sanitizeMode(s?.mode), ck: sanitizeCockpit(s?.ck) };
})();

/** CrtRenderer still wants one flat settings object; compose it from the axes. */
function crtSettings(e: ReturnType<typeof effectiveVisual>) {
  return { ...e.effects, mono: e.scheme.mono, tint: e.scheme.tint };
}

/** xterm theme from the colour scheme, ANSI palette included when it has one. */
function termTheme(e: ReturnType<typeof effectiveVisual>) {
  return {
    ...(e.scheme.ansi ?? {}),
    foreground: e.scheme.foreground,
    background: e.scheme.background,
    cursor: e.scheme.cursor,
  };
}

const b64ToBytes = (b64: string) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const chunkDecoder = new TextDecoder();

let tauriAlive = true; // false = browser demo mode

export let onCwdChange: (paneId: number, path: string) => void = () => {};
export const setOnCwdChange = (fn: typeof onCwdChange) => { onCwdChange = fn; };

// ---------- pane ----------

class Pane {
  term: Terminal;
  fit = new FitAddon();
  search = new SearchAddon();
  el: HTMLDivElement;
  alive = false;
  exited = false;
  activity = false;
  /** Path of the active output log, or null when not logging. */
  logging: string | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCmd: string | null = null;
  /** OSC 133 shell integration seen on this pty (zsh gets it injected). */
  private integrated = false;
  /** Shell is sitting at a prompt (between 133;B and 133;C). */
  atPrompt = false;
  /** Absolute buffer position where the prompt's input starts (133;B). */
  private inputStart: { x: number; y: number } | null = null;
  /** Text queued for insertAtPrompt while the shell isn't at a prompt yet;
   *  written (no carriage return) on the next OSC 133 B mark. */
  private pendingInsert: string | null = null;
  /** Per-pane output watchers. */
  triggers: Trigger[] = [];

  constructor(public id: number) {
    this.el = document.createElement("div");
    this.el.className = "pane";
    termContainer.appendChild(this.el);
    const ev = effectiveVisual(visual, false);
    this.term = new Terminal({
      fontFamily: FONTS[ev.font] ?? FONTS.ibmvga,
      fontSize: ev.fontSize,
      cursorBlink: visual.ck.cursorBlink,
      cursorStyle: "block",
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: termTheme(ev),
    });
    this.term.loadAddon(this.fit);
    this.term.loadAddon(this.search);
    // Links open on Cmd+click only; a bare click in a terminal is a cursor
    // move, not navigation intent.
    this.term.loadAddon(
      new WebLinksAddon((e, uri) => {
        if (isMac ? e.metaKey : e.ctrlKey) {
          openUrl(uri).catch(() => window.open(uri));
        }
      }),
    );
    this.term.open(this.el);
    try {
      this.term.loadAddon(new CanvasAddon());
    } catch {}
    this.term.attachCustomKeyEventHandler((e) => handleKey(this, e));
    this.term.parser.registerOscHandler(7, (data) => {
      const p = oscUrlToPath(data);
      if (p) onCwdChange(this.id, p);
      return true;
    });
    // OSC 133 (FinalTerm / iTerm2 / VS Code prompt marks), emitted by the
    // injected zsh hooks: A prompt start, B input start, C command start,
    // D command done. A fires the preset start command instead of the settle
    // timer; B/C bound click-to-caret to the live input line.
    this.term.parser.registerOscHandler(133, (data) => {
      this.integrated = true;
      if (this.settleTimer) {
        clearTimeout(this.settleTimer);
        this.settleTimer = null;
      }
      const mark = data[0];
      if (mark === "A" && this.pendingCmd !== null) {
        const cmd = this.pendingCmd;
        this.pendingCmd = null;
        this.write(cmd + "\r");
      } else if (mark === "B") {
        const b = this.term.buffer.active;
        this.inputStart = { x: b.cursorX, y: b.baseY + b.cursorY };
        this.atPrompt = true;
        if (this.pendingInsert !== null) {
          const text = this.pendingInsert;
          this.pendingInsert = null;
          this.write(text);
        }
      } else if (mark === "C") {
        this.atPrompt = false;
        this.inputStart = null;
      } else if (mark === "D") {
        attention.apply({ kind: "cmd-done", paneId: this.id }, Date.now());
      }
      return true;
    });
    this.term.onBell(() => attention.apply({ kind: "bell", paneId: this.id }, Date.now()));
    this.term.onTitleChange((t) =>
      attention.apply({ kind: "title", paneId: this.id, title: t }, Date.now()),
    );
    this.term.parser.registerOscHandler(9, (data) => {
      attention.apply({ kind: "osc9", paneId: this.id, text: data.slice(0, 120) }, Date.now());
      return true;
    });
    this.term.onData((data) => {
      if (this.exited) return;
      routeInput(this, data);
    });
  }

  write(data: string) {
    if (tauriAlive && this.alive) {
      invoke("pty_write", { id: ptyId(this.id), data }).catch(() => {});
    }
  }

  async spawn(cwd?: string, startCmd?: string) {
    this.exited = false;
    this.pendingCmd = startCmd ?? null;
    const channel = new Channel<PtyEvent>();
    channel.onmessage = (ev) => {
      if (ev.type === "data") {
        this.term.write(b64ToBytes(ev.b64));
        // Fallback for shells without OSC 133 (bash without the README
        // snippet): fire the start command once output settles.
        if (this.pendingCmd !== null && this.settleTimer === null && !this.integrated) {
          const cmd = this.pendingCmd;
          this.settleTimer = setTimeout(() => {
            this.settleTimer = null;
            if (this.integrated || this.pendingCmd === null) return;
            this.pendingCmd = null;
            this.write(cmd + "\r");
          }, 800);
        }
        markActivity(this);
        if (attention.get(this.id)?.fgProcess === "claude" || this.triggers.length > 0) {
          const text = chunkDecoder.decode(b64ToBytes(ev.b64));
          if (attention.get(this.id)?.fgProcess === "claude") {
            const c = classifyClaude(text.slice(-2000));
            if (c) attention.apply({ kind: "claude", paneId: this.id, state: c }, Date.now());
          }
          if (this.triggers.length > 0) {
            const lastLine = text.split("\n").pop() ?? "";
            const hit = matchTrigger(this.triggers, lastLine);
            if (hit) attention.apply({ kind: "trigger", paneId: this.id, label: hit.label }, Date.now());
          }
        }
      } else {
        this.alive = false;
        this.exited = true;
        this.term.write(
          "\r\n\x1b[7m process exited — press any key to restart \x1b[0m\r\n",
        );
      }
    };
    await invoke("pty_spawn", {
      id: ptyId(this.id),
      cwd: cwd ?? null,
      rows: this.term.rows,
      cols: this.term.cols,
      channel,
    });
    this.alive = true;
  }

  respawn() {
    const leaf = activeTab() ? findLeaf(activeTab()!.layout, this.id) : null;
    this.term.write("\r\n");
    this.spawn(leaf?.cwd).catch(() => {});
  }

  /** Move the shell's caret to the clicked cell by replaying arrow keys.
   *  Only while the shell sits at a prompt (OSC 133 B..C), only within the
   *  current input (never left of the prompt, never past the typed text),
   *  and only when the viewport is not scrolled into history. */
  clickToCaret(clientX: number, clientY: number): void {
    if (!this.atPrompt || !this.inputStart || this.term.hasSelection()) return;
    const b = this.term.buffer.active;
    if (b.viewportY !== b.baseY) return;
    const screen = this.el.querySelector(".xterm-screen");
    if (!screen) return;
    const r = screen.getBoundingClientRect();
    const col = Math.floor(((clientX - r.left) / r.width) * this.term.cols);
    const row = b.baseY + Math.floor(((clientY - r.top) / r.height) * this.term.rows);
    if (col < 0 || col >= this.term.cols) return;
    const cursor = { x: b.cursorX, y: b.baseY + b.cursorY };
    if (row < this.inputStart.y || row > cursor.y) return;
    const line = b.getLine(row);
    const lineEnd = line ? line.translateToString(true).length : 0;
    let targetX = Math.min(col, lineEnd);
    if (row === this.inputStart.y) targetX = Math.max(targetX, this.inputStart.x);
    const delta = (row - cursor.y) * this.term.cols + (targetX - cursor.x);
    if (delta === 0 || Math.abs(delta) > 4000) return;
    this.write((delta > 0 ? "\x1b[C" : "\x1b[D").repeat(Math.abs(delta)));
  }

  /** Place text at the shell prompt without submitting it (no carriage
   *  return). If the shell is already at a prompt, write immediately;
   *  otherwise queue it for the next OSC 133 B mark (prompt just spawned). */
  insertAtPrompt(text: string) {
    if (this.atPrompt) this.write(text);
    else this.pendingInsert = text;
  }

  layoutPx(x: number, y: number, w: number, h: number, visible: boolean) {
    this.el.style.display = visible ? "block" : "none";
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    if (visible) {
      this.fit.fit();
      // fit() clears xterm's layer canvases on resize; an unfocused pane with
      // no pty output never repaints them, and the compositor keeps drawing
      // the cleared canvas (blank pane until refocus). Repaint explicitly.
      this.term.refresh(0, this.term.rows - 1);
      if (tauriAlive && this.alive) {
        invoke("pty_resize", { id: ptyId(this.id), rows: this.term.rows, cols: this.term.cols }).catch(
          () => {},
        );
      }
    }
  }

  dispose() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (tauriAlive) invoke("pty_kill", { id: ptyId(this.id) }).catch(() => {});
    this.term.dispose();
    this.el.remove();
  }
}

// ---------- tabs / workspace state ----------

interface Tab {
  title: string;
  layout: LayoutNode;
  focused: number;
  /** Session-only: typing in one pane goes to every pane in this space. */
  broadcast?: boolean;
}

const tabs: Tab[] = [];
let activeTabIdx = 0;
let presets: Preset[] = [];
let snippets: Snippet[] = [];
const panes = new Map<number, Pane>();
let nextPaneId = 1;
/** Undo-close stack, in-memory only (cleared implicitly on app quit). */
let closedStack: ClosedPane[] = [];

function captureScroll(pane: Pane): string {
  const b = pane.term.buffer.active;
  return serializeScrollback((i) => b.getLine(i)?.translateToString(true) ?? "", b.baseY + pane.term.rows);
}

const activeTab = (): Tab | undefined => tabs[activeTabIdx];
const attention = createAttentionStore({
  // Focused means: the focused pane of the active space, in a focused window.
  isFocused: (id) => activeTab()?.focused === id && document.hasFocus(),
});
let prevAttentionCount = 0;
attention.onChange(() => {
  if (!visual.ck.attention.enabled) return;
  renderChrome();
  const n = attention.attentionCount();
  if (visual.ck.attention.sound && n > prevAttentionCount) sound.attention();
  prevAttentionCount = n;
});

function pushTray() {
  if (!tauriAlive) return;
  const ck = visual.ck.attention;
  const items = !ck.enabled || !ck.tray
    ? []
    : attention.all()
        .filter((p) => p.state === "needs-input" || p.state === "done")
        .map((p) => {
          const tabIdx = tabs.findIndex((t) => paneIds(t.layout).includes(p.paneId));
          const t = tabs[tabIdx];
          const leaf = t ? findLeaf(t.layout, p.paneId) : null;
          const name = leaf?.name ?? p.fgProcess ?? "pane";
          const what = p.message || (p.state === "done" ? "finished" : "needs input");
          return { id: String(p.paneId), label: `${t?.title ?? "?"} / ${name}: ${what}` };
        });
  invoke("tray_update", { win: WIN.win, items }).catch(() => {});
}
attention.onChange(pushTray);

listen<{ id: string }>("tray-jump", (e) => {
  const paneId = Number(e.payload.id);
  const tabIdx = tabs.findIndex((t) => paneIds(t.layout).includes(paneId));
  if (tabIdx === -1) return;
  switchTab(tabIdx);
  focusPane(paneId);
});
const focusedPane = (): Pane | undefined => {
  const t = activeTab();
  return t ? panes.get(t.focused) : undefined;
};

/** Keystrokes fan out to the whole space when its broadcast flag is on. */
function routeInput(source: Pane, data: string) {
  const t = activeTab();
  if (t?.broadcast && paneIds(t.layout).includes(source.id)) {
    for (const id of paneIds(t.layout)) {
      panes.get(id)?.write(data);
    }
    return;
  }
  source.write(data);
}

function toggleBroadcast() {
  const t = activeTab();
  if (!t) return;
  t.broadcast = !t.broadcast;
  renderChrome();
}

function markActivity(pane: Pane) {
  const t = activeTab();
  const isFocusedVisible = t && t.focused === pane.id && paneIds(t.layout).includes(pane.id);
  if (!isFocusedVisible) {
    if (!pane.activity) {
      pane.activity = true;
      renderChrome();
    }
  }
}

function makePane(cwd?: string, startCmd?: string): Pane {
  const pane = new Pane(nextPaneId++);
  panes.set(pane.id, pane);
  if (tauriAlive) {
    pane.spawn(cwd, startCmd).catch(() => {
      pane.exited = true;
      pane.term.write("\x1b[7m failed to start shell \x1b[0m\r\n");
    });
  }
  return pane;
}

// ---------- rendering ----------

let renderQueued = false;

let cockpitRef: Cockpit | null = null;

function renderAll() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    doRender();
  });
}

function doRender() {
  const t = activeTab();
  if (!t) return;
  const cw = termContainer.clientWidth;
  const ch = termContainer.clientHeight;
  const rects = paneRects(t.layout);
  const visible = new Set(paneIds(t.layout));

  for (const [id, pane] of panes) {
    const r = rects.get(id);
    if (r && visible.has(id)) {
      const gap = 3;
      pane.layoutPx(
        Math.round(r.x * cw) + gap,
        Math.round(r.y * ch) + gap,
        Math.round(r.w * cw) - gap * 2,
        Math.round(r.h * ch) - gap * 2,
        true,
      );
    } else {
      pane.el.style.display = "none";
    }
  }

  renderChrome();
}

function renderChrome() {
  const t = activeTab();
  if (!t) return;
  const ids = paneIds(t.layout);
  const sources = ids
    .map((id) => panes.get(id))
    .filter((p): p is Pane => !!p)
    .map((p) => ({
      el: p.el as HTMLElement,
      focused: p.id === t.focused,
      // Live scroll ghost: read at draw time, not chrome-render time.
      scrollInfo: () => {
        const b = p.term.buffer.active;
        const rows = p.term.rows;
        return {
          show: b.baseY > 0 && b.viewportY < b.baseY,
          frac: b.baseY > 0 ? b.viewportY / b.baseY : 1,
          thumb: rows / (b.baseY + rows),
        };
      },
    }));
  const bars: BarSource[] = splitBars(t.layout).map((b) => ({ dir: b.dir, rect: b.rect }));

  const status = ids
    .map((id, i) => {
      const pane = panes.get(id);
      const leaf = findLeaf(t.layout, id);
      const label =
        leaf?.name ??
        leaf?.startCmd ??
        (leaf?.cwd ? leaf.cwd.replace(/^\/Users\/[^/]+/, "~") : "shell");
      const mark = id === t.focused ? ">" : pane?.activity ? "●" : " ";
      return `${mark}${i + 1}:${label}`;
    })
    .join("   ");
  crt.setSources(sources, bars, (t.broadcast ? "⇄ BCAST   " : "") + status);
  // The SPACES widget replaces the in-glass column while it is showing;
  // rendering both would list every space twice with two click targets.
  const spacesWidgetShowing = visual.mode === "cockpit" && visual.ck.widgets.enabled.spaces;
  // Reclaim the 205px the in-glass column would have occupied, otherwise the
  // terminal sits right-justified behind a dead gap.
  document.documentElement.style.setProperty(
    "--term-left",
    spacesWidgetShowing ? "18px" : "205px",
  );
  crt.setTabs(
    spacesWidgetShowing
      ? []
      : tabs.map((tab, i) => ({
          title: tab.title,
          active: i === activeTabIdx,
          activity:
            paneIds(tab.layout).some((id) => panes.get(id)?.activity) && i !== activeTabIdx,
          attention:
            visual.ck.attention.enabled && visual.ck.attention.badges &&
            spaceAttention(paneIds(tab.layout), (id) => attention.get(id)),
        })),
  );
  setAttention(visual.ck.attention.enabled ? attention.attentionCount() : 0);
  // Not `cockpit?.` : renderAll can run before that const initializes, and
  // optional chaining does not save you from the temporal dead zone.
  cockpitRef?.refreshSpaces();
}

// ---------- workspace persistence ----------

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function currentWorkspace(): WorkspaceFile {
  return {
    version: 3,
    tabs: tabs.map((t) => ({ title: t.title, layout: t.layout })),
    activeTab: activeTabIdx,
    presets,
  };
}

function scheduleSave() {
  if (!tauriAlive) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    invoke("workspace_save", { json: JSON.stringify(currentWorkspace(), null, 2), ...wsArgs() }).catch(
      () => {},
    );
  }, 1000);
}

async function refreshCwds() {
  if (!tauriAlive) return;
  for (const t of tabs) {
    for (const id of paneIds(t.layout)) {
      const pane = panes.get(id);
      if (!pane?.alive) continue;
      try {
        const cwd = await invoke<string>("pty_cwd", { id: ptyId(id) });
        if (cwd) {
          if (findLeaf(t.layout, id)?.cwd !== cwd) {
            t.layout = updateLeaf(t.layout, id, { cwd });
          }
          onCwdChange(id, cwd);
        }
      } catch {}
    }
  }
  scheduleSave();
}

// ---------- tab / pane operations ----------

function buildTab(title: string, layout: LayoutNode): Tab {
  for (const leafId of paneIds(layout)) {
    const leaf = findLeaf(layout, leafId)!;
    const pane = new Pane(leafId);
    panes.set(leafId, pane);
    if (tauriAlive) {
      pane.spawn(leaf.cwd, leaf.startCmd).catch(() => {
        pane.exited = true;
      });
    }
  }
  return { title, layout, focused: paneIds(layout)[0] };
}

function newTab(cwd?: string, startCmd?: string) {
  const pane = makePane(cwd, startCmd);
  let layout: LayoutNode = { pane: pane.id };
  if (cwd || startCmd) layout = updateLeaf(layout, pane.id, { cwd, startCmd });
  tabs.push({ title: startCmd ?? `term ${tabs.length + 1}`, layout, focused: pane.id });
  switchTab(tabs.length - 1);
  scheduleSave();
}

function openPreset(p: Preset) {
  for (const s of presetSpaces(p)) {
    newTab(s.cwd, s.cmd);
    const t = tabs[tabs.length - 1];
    if (t && s.title) t.title = s.title;
  }
  lastPreset = p.name;
  refreshCfgLabel();
  renderChrome();
  scheduleSave();
}

/** Launch a preset in a fresh window via a one-shot localStorage handoff.
 *  ponytail: two windows booting at the same instant could race for it;
 *  single-user app, the loser just gets the default space. */
function openPresetWindow(p: Preset) {
  localStorage.setItem("phosphor-open-preset", JSON.stringify({ name: p.name, spaces: presetSpaces(p) }));
  openWindow(activeConfig);
}

/** The current spaces as SpaceSpecs: focused pane's cwd and start command, tab title. */
function currentSpaceSpecs(): SpaceSpec[] {
  return tabs.map((t) => {
    const leaf = findLeaf(t.layout, t.focused);
    return { title: t.title, cwd: leaf?.cwd ?? "", cmd: leaf?.startCmd };
  });
}

function switchTab(i: number) {
  if (i < 0 || i >= tabs.length) return;
  activeTabIdx = i;
  const t = tabs[i];
  // Show the panes first: term.focus() on a display:none element is a no-op,
  // so focusing before doRender left the terminal unfocused after a space
  // switch or a space close (2026-08-21).
  doRender();
  const pane = panes.get(t.focused);
  if (pane) {
    pane.activity = false;
    pane.term.focus();
  }
  attention.apply({ kind: "focus", paneId: t.focused }, Date.now());
  scheduleSave();
}

function reorderTabs(from: number, to: number) {
  if (from === to) return;
  const active = tabs[activeTabIdx];
  const next = moveItem(tabs, from, to);
  tabs.splice(0, tabs.length, ...next);
  activeTabIdx = Math.max(0, tabs.indexOf(active));
  doRender();
  scheduleSave();
}

/** userInitiated: true for a direct space close (tab-bar click, menu item);
 *  false when closeFocused calls this as a cascade, which already captured
 *  the pane itself. Never captures when this is the last tab (the window is
 *  closing, not restoring into anything). */
function closeTab(i: number, userInitiated = true) {
  const t = tabs[i];
  if (!t) return;
  if (userInitiated && tabs.length > 1) {
    const leaf = findLeaf(t.layout, t.focused);
    const pane = panes.get(t.focused);
    if (pane) {
      closedStack = pushClosed(closedStack, {
        title: leaf?.name ?? t.title,
        cwd: leaf?.cwd,
        startCmd: leaf?.startCmd,
        scroll: captureScroll(pane),
        wasLastInTab: true,
      });
    }
  }
  for (const id of paneIds(t.layout)) {
    panes.get(id)?.dispose();
    panes.delete(id);
    attention.apply({ kind: "closed", paneId: id }, Date.now());
  }
  tabs.splice(i, 1);
  if (tabs.length === 0) {
    if (tauriAlive) {
      invoke("workspace_save", { json: JSON.stringify(currentWorkspace(), null, 2), ...wsArgs() })
        .catch(() => {})
        .finally(() => getCurrentWindow().close());
      return;
    }
    newTab();
    return;
  }
  if (activeTabIdx >= tabs.length) activeTabIdx = tabs.length - 1;
  switchTab(activeTabIdx);
}

function focusPane(id: number) {
  const t = activeTab();
  if (!t || !paneIds(t.layout).includes(id)) return;
  t.focused = id;
  const pane = panes.get(id);
  if (pane) {
    pane.activity = false;
    pane.term.focus();
  }
  attention.apply({ kind: "focus", paneId: id }, Date.now());
  renderChrome();
}

function splitFocused(dir: "h" | "v") {
  const t = activeTab();
  if (!t) return;
  const from = findLeaf(t.layout, t.focused);
  const pane = makePane(from?.cwd);
  t.layout = splitPane(t.layout, t.focused, dir, pane.id);
  if (from?.cwd) t.layout = updateLeaf(t.layout, pane.id, { cwd: from.cwd });
  t.focused = pane.id;
  doRender();
  pane.term.focus();
  scheduleSave();
}

function closeFocused() {
  const t = activeTab();
  if (!t) return;
  const id = t.focused;
  const leaf = findLeaf(t.layout, id);
  const pane = panes.get(id);
  const next = closePane(t.layout, id);
  if (pane) {
    closedStack = pushClosed(closedStack, {
      title: leaf?.name ?? t.title,
      cwd: leaf?.cwd,
      startCmd: leaf?.startCmd,
      scroll: captureScroll(pane),
      wasLastInTab: next === null,
    });
  }
  pane?.dispose();
  panes.delete(id);
  attention.apply({ kind: "closed", paneId: id }, Date.now());
  if (next === null) {
    closeTab(activeTabIdx, false);
    return;
  }
  t.layout = next;
  t.focused = paneIds(next)[0];
  doRender();
  focusPane(t.focused);
  scheduleSave();
}

/** Restore the most recently closed pane: a new space if it cascaded to
 *  closeTab, otherwise a split in the current space. Scrollback is written
 *  back in verbatim, marked inert; a startup command is placed at the
 *  prompt unsubmitted, never auto-run. */
function undoClose() {
  const { stack, item } = popClosed(closedStack);
  closedStack = stack;
  if (!item) return;
  if (item.wasLastInTab) {
    newTab(item.cwd);
    const t = tabs[tabs.length - 1];
    t.title = item.title;
    renderChrome();
  } else {
    splitFocused("h");
    const t = activeTab();
    if (t && item.cwd) t.layout = updateLeaf(t.layout, t.focused, { cwd: item.cwd });
  }
  const pane = focusedPane();
  if (!pane) return;
  pane.term.write(item.scroll + "\r\n\x1b[2m-- restored (inert) --\x1b[0m\r\n");
  if (item.startCmd) pane.insertAtPrompt(item.startCmd);
}

// ---------- input ----------

function pasteText(pane: Pane, text: string) {
  const trimmed = stripTrailingNewlines(text);
  if (!trimmed) return;
  // Interior newlines execute commands the moment they land; show them first,
  // unless the guard is switched off in Config (PH-4).
  if (visual.ck.pasteGuard && needsPasteConfirm(trimmed)) openPasteConfirm(pane, trimmed);
  else pane.term.paste(trimmed);
}

function saveSnippets() {
  invoke("snippets_save", { json: JSON.stringify(snippets, null, 2) }).catch(() => {});
}

// ---------- multi-line paste preview ----------

const pasteConfirmEl = document.createElement("div");
pasteConfirmEl.id = "pasteconfirm";
pasteConfirmEl.classList.add("hidden");
document.body.append(pasteConfirmEl);

function openPasteConfirm(pane: Pane, text: string) {
  const { lines, more } = pastePreview(text);
  pasteConfirmEl.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "panel";
  const h = document.createElement("h1");
  h.textContent = `PASTE ${text.split("\n").length} LINES?`;
  const pre = document.createElement("pre");
  pre.textContent = lines.join("\n") + (more > 0 ? `\n… ${more} more line${more === 1 ? "" : "s"}` : "");
  const why = document.createElement("div");
  why.className = "why";
  why.textContent =
    "Held so a multi-line paste cannot run commands you did not mean to. Nothing is quoted or changed. Turn this off: Cmd+, → PASTE GUARD.";
  const row = document.createElement("div");
  row.className = "row";
  const mk = (label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => {
      pasteConfirmEl.classList.add("hidden");
      fn();
      pane.term.focus();
    });
    return b;
  };
  row.append(
    mk("PASTE", () => pane.term.paste(text)),
    mk("CANCEL", () => {}),
  );
  panel.append(h, pre, why, row);
  pasteConfirmEl.append(panel);
  pasteConfirmEl.classList.remove("hidden");
}

// ---------- find in scrollback ----------

const searchEl = document.createElement("div");
searchEl.id = "searchbar";
searchEl.classList.add("hidden");
const searchInput = document.createElement("input");
plainTextInput(searchInput);
searchInput.placeholder = "find… Enter next · Shift+Enter prev · Esc";
searchEl.append(searchInput);
document.body.append(searchEl);

function openSearch() {
  searchEl.classList.remove("hidden");
  searchInput.select();
  searchInput.focus();
}
function closeSearch() {
  searchEl.classList.add("hidden");
  const pane = focusedPane();
  pane?.search.clearDecorations();
  pane?.term.focus();
}
searchInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  const pane = focusedPane();
  if (e.key === "Escape") closeSearch();
  else if (e.key === "Enter" && e.shiftKey) pane?.search.findPrevious(searchInput.value);
  else if (e.key === "Enter") pane?.search.findNext(searchInput.value);
});
searchInput.addEventListener("input", () => {
  focusedPane()?.search.findNext(searchInput.value, { incremental: true });
});

// ---------- global search (every pane, every space) ----------

function globalSearch(q: string): { results: PaneHits[]; truncated: boolean } {
  const results: PaneHits[] = [];
  let total = 0;
  let truncated = false;
  outer: for (let tabIdx = 0; tabIdx < tabs.length; tabIdx++) {
    const t = tabs[tabIdx];
    for (const paneId of paneIds(t.layout)) {
      const pane = panes.get(paneId);
      if (!pane) continue;
      const b = pane.term.buffer.active;
      const hits = searchLines((i) => b.getLine(i)?.translateToString(true) ?? "", b.baseY + pane.term.rows, q, 50);
      if (hits.length === 0) continue;
      if (hits.length === 50) truncated = true;
      const room = 200 - total;
      if (room <= 0) {
        truncated = true;
        break outer;
      }
      const capped = hits.length > room ? hits.slice(0, room) : hits;
      if (capped.length < hits.length) truncated = true;
      total += capped.length;
      const leaf = findLeaf(t.layout, paneId);
      results.push({ tabIdx, paneId, label: `${t.title} / ${leaf?.name ?? "pane"}`, hits: capped });
    }
  }
  return { results, truncated };
}

const globalSearchOverlay = new GlobalSearchOverlay(globalSearch, (tabIdx, paneId, q) => {
  switchTab(tabIdx);
  focusPane(paneId);
  openSearch();
  searchInput.value = q;
  focusedPane()?.search.findNext(q);
});

// ---------- pane output logging ----------

function togglePaneLog(pane: Pane) {
  if (pane.logging) {
    invoke("pty_log_stop", { id: ptyId(pane.id) }).catch(() => {});
    pane.logging = null;
    return;
  }
  invoke<string>("pty_log_start", { id: ptyId(pane.id) })
    .then((path) => {
      pane.logging = path;
      // the path lands on the clipboard so it's pasteable anywhere
      navigator.clipboard.writeText(path).catch(() => {});
    })
    .catch(() => {});
}

function insertPaths(pane: Pane, paths: string[]) {
  pane.write(paths.map(shellQuote).join(" ") + " ");
}

async function smartPaste(pane: Pane) {
  try {
    const r = await invoke<PasteResult>("smart_paste");
    if (r.kind === "path") insertPaths(pane, [r.path]);
    else if (r.kind === "text") pasteText(pane, r.text);
  } catch {
    try {
      const t = await navigator.clipboard.readText();
      if (t) pasteText(pane, t);
    } catch {}
  }
}

const isMac = /Mac|iP/.test(navigator.platform);

/** Keyboard chords. macOS uses Cmd; Linux/Windows use the terminal-standard
 *  Ctrl+Shift layer (plain Ctrl combos must keep reaching the shell). */
function handleKey(pane: Pane, e: KeyboardEvent): boolean {
  if (e.type !== "keydown") return true;
  if (document.body.dataset.mode === "cockpit") sound.keystroke();
  if (pane.exited && !(isMac ? e.metaKey : e.ctrlKey)) {
    pane.respawn();
    return false;
  }

  // Dispatch from the one table the help overlay renders, so a chord cannot
  // exist in the list without existing here.
  const sc = findShortcut(e);
  if (!sc) return true;
  switch (sc.id) {
    case "newline":
      pane.write("\x1b\r"); // ESC+CR: newline chord for Claude Code and friends
      return false;
    case "focuspane": {
      const t = activeTab();
      if (t) {
        const dir = e.key.replace("Arrow", "").toLowerCase() as
          | "left" | "right" | "up" | "down";
        const n = neighbor(t.layout, t.focused, dir);
        if (n !== null) focusPane(n);
      }
      return false;
    }
    case "switchspace":
      switchTab(Number(e.key) - 1);
      return false;
    case "splitdown":
      splitFocused("v");
      return false;
    case "splitright":
      splitFocused("h");
      return false;
    case "presets":
      openPresetMenu();
      return false;
    case "newspace":
      newTab();
      return false;
    case "close":
      // The native menu's Close Window accelerator is also Cmd+W; without
      // this it fires a close-requested event, whose handler disposes every
      // pane in the window (blank terminals, 2026-08-21).
      e.preventDefault();
      closeFocused();
      return false;
    case "paste":
      // Without this the browser's native paste lands in xterm's textarea
      // first, so the guard modal asked about text that had already gone in.
      e.preventDefault();
      smartPaste(pane);
      return false;
    case "copy":
      // With no selection this is not a copy; let the shell have the key.
      if (!pane.term.hasSelection()) return true;
      navigator.clipboard.writeText(pane.term.getSelection()).catch(() => {});
      return false;
    case "clear":
      pane.term.clear();
      return false;
    default:
      // cockpit, fullscreen, config, help are owned by the window handler.
      return true;
  }
}

// they run before xterm sees the event; stopPropagation keeps them single-fire.
window.addEventListener(
  "keydown",
  (e) => {
    // Dispatch from the one table the help overlay renders.
    const sc = findShortcut(e);
    if (sc?.id === "cockpit") {
      setMode(visual.mode === "crt" ? "cockpit" : "crt");
    } else if (sc?.id === "fullscreen") {
      const w = getCurrentWindow();
      w.isFullscreen().then((fs) => w.setFullscreen(!fs)).catch(() => {});
    } else if (sc?.id === "config") {
      configScreen.toggle();
      refreshVisual();
      if (!configScreen.open) focusedPane()?.term.focus();
    } else if (sc?.id === "help") {
      shortcuts.toggle();
    } else if (sc?.id === "palette") {
      palette.toggle();
    } else if (sc?.id === "find") {
      openSearch();
    } else if (sc?.id === "globalsearch") {
      globalSearchOverlay.show();
    } else if (sc?.id === "undoclose") {
      undoClose();
    } else if (sc?.id === "broadcast") {
      toggleBroadcast();
    } else if (sc?.id === "switchspace") {
      switchTab(Number(e.key) - 1);
    } else if (sc?.id === "newspace") {
      newTab();
    } else if (sc?.id === "newwindow") {
      openWindow(activeConfig);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

export const KEY_HINT = isMac
  ? "Cmd+, settings \u00b7 Cmd+D/Shift+D split \u00b7 Cmd+W close \u00b7 Cmd+T space \u00b7 Cmd+Shift+T presets \u00b7 Shift+Enter newline \u00b7 paste never auto-runs \u00b7 Cmd+Shift+M cockpit \u00b7 Cmd+Ctrl+F fullscreen"
  : "Ctrl+, settings \u00b7 Ctrl+Shift+D/B split \u00b7 Ctrl+Shift+W close \u00b7 Ctrl+Shift+T space \u00b7 Ctrl+Shift+P presets \u00b7 Alt+1-9 spaces \u00b7 Shift+Enter newline \u00b7 paste never auto-runs";

// ---------- pointer routing through the glass ----------

interface DragState {
  path: string;
  dir: "h" | "v";
}
let drag: DragState | null = null;

/** screen point -> content-area css point (undoing barrel distortion) */
function toContentPoint(e: MouseEvent): { x: number; y: number } {
  const cr = crtCanvas.getBoundingClientRect();
  const [cu, cv] = screenToContent(
    (e.clientX - cr.x) / cr.width,
    (e.clientY - cr.y) / cr.height,
    crt.settings.curvature,
  );
  return { x: cr.x + cu * cr.width, y: cr.y + cv * cr.height };
}

function paneAtPoint(p: { x: number; y: number }): Pane | null {
  const t = activeTab();
  if (!t) return null;
  for (const id of paneIds(t.layout)) {
    const pane = panes.get(id);
    if (!pane) continue;
    const r = pane.el.getBoundingClientRect();
    if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) return pane;
  }
  return null;
}

function barAtPoint(p: { x: number; y: number }): DragState | null {
  const t = activeTab();
  if (!t) return null;
  const tr = termContainer.getBoundingClientRect();
  for (const bar of splitBars(t.layout)) {
    if (bar.dir === "h") {
      const bx = tr.x + bar.rect.x * tr.width;
      const y0 = tr.y + bar.rect.y * tr.height;
      const y1 = tr.y + (bar.rect.y + bar.rect.h) * tr.height;
      if (Math.abs(p.x - bx) < 6 && p.y >= y0 && p.y <= y1) return { path: bar.path, dir: "h" };
    } else {
      const by = tr.y + bar.rect.y * tr.height;
      const x0 = tr.x + bar.rect.x * tr.width;
      const x1 = tr.x + (bar.rect.x + bar.rect.w) * tr.width;
      if (Math.abs(p.y - by) < 6 && p.x >= x0 && p.x <= x1) return { path: bar.path, dir: "v" };
    }
  }
  return null;
}

function forward(pane: Pane, e: MouseEvent, p: { x: number; y: number }) {
  const target = pane.el.querySelector(".xterm") ?? pane.el;
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: p.x,
    clientY: p.y,
    button: e.button,
    buttons: e.buttons,
    detail: e.detail,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
  };
  target.dispatchEvent(
    e instanceof WheelEvent
      ? new WheelEvent(e.type, { ...init, deltaY: e.deltaY, deltaX: e.deltaX })
      : new MouseEvent(e.type, init),
  );
}

let plusTimer: ReturnType<typeof setTimeout> | null = null;
let tabDrag: { from: number; startY: number; moved: boolean } | null = null;
// Safety net: a mouseup that lands off the capture layer (button released
// outside the canvas mid-drag) never reaches the capture handler's own
// tabDrag clear below, so it would otherwise stick and swallow later drags.
window.addEventListener("mouseup", () => {
  setTimeout(() => {
    tabDrag = null;
  }, 0);
});

// ---- one-CRT widget event forwarding ----
// In cockpit + retro the capture layer covers the whole window and the
// widget DOM is invisible; events are inverse-mapped and replayed onto the
// element under the mapped point, the same trick the panes use.

const bezelEl = document.getElementById("bezel")!;
let domDownTarget: Element | null = null;

/** Element under a mapped layout point; glass content stays with pane routing. */
function domTargetAt(p: { x: number; y: number }): Element | null {
  const cap = captureEl as HTMLElement;
  cap.style.pointerEvents = "none";
  const el = document.elementFromPoint(p.x, p.y);
  cap.style.pointerEvents = "";
  if (!el || el === document.body || el === document.documentElement) return null;
  if (bezelEl.contains(el)) return null;
  return el;
}

function forwardDom(el: Element, e: MouseEvent, p: { x: number; y: number }) {
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: p.x,
    clientY: p.y,
    button: e.button,
    buttons: e.buttons,
    detail: e.detail,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
  };
  if (e instanceof WheelEvent) {
    // Synthetic wheel events never trigger native scrolling; scroll by hand.
    let n: HTMLElement | null = el as HTMLElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && n.scrollHeight > n.clientHeight) {
        n.scrollTop += e.deltaY;
        return;
      }
      n = n.parentElement;
    }
    return;
  }
  el.dispatchEvent(new MouseEvent(e.type, init));
  // Synthetic mousedown/up pairs don't auto-generate click; do it ourselves.
  if (e.type === "mousedown") domDownTarget = el;
  if (e.type === "mouseup") {
    if (domDownTarget && (domDownTarget === el || domDownTarget.contains(el) || el.contains(domDownTarget))) {
      el.dispatchEvent(new MouseEvent("click", init));
    }
    domDownTarget = null;
  }
}

function wireCapture() {
  const handler = (e: MouseEvent) => {
    if (e.type === "contextmenu") {
      e.preventDefault();
      const p = toContentPoint(e);
      const tabHit = tabHitAt(crtCanvas.getBoundingClientRect(), tabs.length, p);
      if (tabHit && tabHit.kind !== "plus") {
        openTabMenu(tabHit.index, e.clientX, e.clientY);
        return;
      }
      const pane = paneAtPoint(p);
      if (pane) {
        openPaneMenu(pane, e.clientX, e.clientY);
        return;
      }
      const el = domTargetAt(p);
      el?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }),
      );
      return;
    }
    const p = toContentPoint(e);

    if (tabDrag && e.type === "mousemove") {
      if (Math.abs(p.y - tabDrag.startY) > 6) tabDrag.moved = true;
      return;
    }
    if (tabDrag && e.type === "mouseup") {
      const drag = tabDrag;
      tabDrag = null;
      if (drag.moved) {
        const rows = tabColumnRects(crtCanvas.getBoundingClientRect(), tabs.length).rows;
        // Drop target: the row whose vertical band the pointer is in; clamp to the ends.
        let to = rows.findIndex((r) => p.y >= r.y && p.y <= r.y + r.h);
        if (to === -1) to = p.y < rows[0].y ? 0 : tabs.length - 1;
        reorderTabs(drag.from, to);
      }
      return;
    }
    const tabHit = tabHitAt(crtCanvas.getBoundingClientRect(), tabs.length, p);
    if (tabHit) {
      if (e.type === "mousedown") {
        if (tabHit.kind === "tab") {
          switchTab(tabHit.index);
          tabDrag = { from: tabHit.index, startY: p.y, moved: false };
        } else if (tabHit.kind === "close") closeTab(tabHit.index);
        else {
          plusTimer = setTimeout(() => {
            plusTimer = null;
            openPresetMenu();
          }, 400);
        }
      }
      if (e.type === "mouseup" && plusTimer) {
        clearTimeout(plusTimer);
        plusTimer = null;
        newTab();
      }
      return;
    }

    if (e.type === "mousedown" && !drag) {
      const bar = barAtPoint(p);
      if (bar) {
        drag = bar;
        e.preventDefault();
        return;
      }
    }
    if (drag) {
      if (e.type === "mousemove") {
        const t = activeTab();
        if (t) {
          const tr = termContainer.getBoundingClientRect();
          // ratio within the split's own rect: recompute from bar path bounds
          const ratio =
            drag.dir === "h" ? (p.x - tr.x) / tr.width : (p.y - tr.y) / tr.height;
          t.layout = setRatioAtPath(t.layout, drag.path, ratio);
          doRender();
        }
      }
      if (e.type === "mouseup") {
        drag = null;
        scheduleSave();
      }
      return;
    }

    const pane = paneAtPoint(p);
    if (!pane) {
      const el = domTargetAt(p);
      if (el) {
        forwardDom(el, e, p);
        e.preventDefault();
      }
      return;
    }
    if (e.type === "mousedown") focusPane(pane.id);
    forward(pane, e, p);
    if (e.type === "mouseup" && e.button === 0 && !e.metaKey && !e.altKey && !e.shiftKey) {
      pane.clickToCaret(p.x, p.y);
    }
    e.preventDefault();
  };

  for (const type of ["mousedown", "mouseup", "mousemove", "dblclick", "contextmenu"]) {
    captureEl.addEventListener(type, handler as EventListener);
  }
  captureEl.addEventListener("wheel", handler as unknown as EventListener, { passive: false });

  captureEl.addEventListener("mousemove", (e) => {
    const p = toContentPoint(e as MouseEvent);
    if (tabHitAt(crtCanvas.getBoundingClientRect(), tabs.length, p)) {
      (captureEl as HTMLElement).style.cursor = "pointer";
      return;
    }
    const bar = drag ?? barAtPoint(p);
    (captureEl as HTMLElement).style.cursor = bar
      ? bar.dir === "h"
        ? "col-resize"
        : "row-resize"
      : paneAtPoint(p)
        ? "text"
        : "default";
  });

  captureEl.addEventListener("mousedown", (e) => {
    if (document.body.dataset.mode !== "cockpit" || window.innerWidth > 1100) return;
    if (e.clientX < 8) document.getElementById("ck-left")!.classList.toggle("open");
    else if (e.clientX > window.innerWidth - 8) document.getElementById("ck-right")!.classList.toggle("open");
  });
}

/** setRatio wants a ratio local to the split node; convert from a global fraction. */
function setRatioAtPath(root: LayoutNode, path: string, globalFrac: number): LayoutNode {
  // walk to the node collecting its rect
  let node: LayoutNode = root;
  let x = 0;
  let y = 0;
  let w = 1;
  let h = 1;
  for (const step of path) {
    if (isLeaf(node)) return root;
    const s = node;
    if (s.split === "h") {
      if (step === "a") w *= s.ratio;
      else {
        x += w * s.ratio;
        w *= 1 - s.ratio;
      }
    } else {
      if (step === "a") h *= s.ratio;
      else {
        y += h * s.ratio;
        h *= 1 - s.ratio;
      }
    }
    node = s[step as "a" | "b"];
  }
  if (isLeaf(node)) return root;
  const local = node.split === "h" ? (globalFrac - x) / w : (globalFrac - y) / h;
  return setRatio(root, path, local);
}

// ---------- menus ----------

function menuItem(label: string, dim: boolean, fn: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = "item" + (dim ? " dim" : "");
  el.textContent = label;
  el.addEventListener("click", () => {
    hideMenus();
    fn();
  });
  return el;
}

function hideMenus() {
  paneMenuEl.classList.add("hidden");
  presetMenuEl.classList.add("hidden");
  tabMenuEl.classList.add("hidden");
}

function placeMenu(el: HTMLElement, x: number, y: number) {
  el.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
  // Show first so the clamp uses the menu's real height, not a guess.
  el.classList.remove("hidden");
  el.style.top = `${Math.min(y, window.innerHeight - el.offsetHeight - 10)}px`;
}

function menuInput(placeholder: string, initial: string, commit: (v: string) => void): HTMLElement {
  const input = document.createElement("input");
  plainTextInput(input);
  input.placeholder = placeholder;
  input.value = initial;
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      hideMenus();
      commit(input.value.trim());
    }
    if (e.key === "Escape") {
      hideMenus();
      shortcuts.close();
    }
  });
  setTimeout(() => input.focus(), 0);
  return input;
}

/** Swap a popover's content to a text input. Re-shows the popover: menuItem
 *  clicks call hideMenus() before the handler runs, so without this the
 *  input would exist in a hidden menu and keystrokes would hit the terminal. */
function swapToInput(
  menuEl: HTMLElement,
  placeholder: string,
  initial: string,
  commit: (v: string) => void,
) {
  menuEl.innerHTML = "";
  menuEl.append(menuInput(placeholder, initial, commit));
  menuEl.classList.remove("hidden");
}

function openPaneMenu(pane: Pane, x: number, y: number) {
  const t = activeTab();
  if (!t) return;
  focusPane(pane.id);
  const leaf = findLeaf(t.layout, pane.id);
  paneMenuEl.innerHTML = "";
  paneMenuEl.append(
    menuItem("Paste", false, () => smartPaste(pane)),
    menuItem("Split right", false, () => splitFocused("h")),
    menuItem("Split down", false, () => splitFocused("v")),
    menuItem("Rename pane…", false, () => {
      swapToInput(paneMenuEl, "pane name", leaf?.name ?? "", (v) => {
        t.layout = updateLeaf(t.layout, pane.id, { name: v || undefined });
        renderChrome();
        scheduleSave();
      });
    }),
    menuItem(`Launch command: ${leaf?.startCmd ?? "(none)"}`, false, () => {
      swapToInput(paneMenuEl, "command, e.g. claude", leaf?.startCmd ?? "", (v) => {
        t.layout = updateLeaf(t.layout, pane.id, { startCmd: v || undefined });
        renderChrome();
        scheduleSave();
      });
    }),
    menuItem("Clear launch command", !leaf?.startCmd, () => {
      t.layout = updateLeaf(t.layout, pane.id, { startCmd: undefined });
      renderChrome();
      scheduleSave();
    }),
    menuItem("Save pane as preset…", false, () => {
      swapToInput(paneMenuEl, "preset name", leaf?.startCmd ?? "", async (name) => {
        if (!name) return;
        let cwd = leaf?.cwd ?? "";
        if (tauriAlive) {
          try {
            cwd = await invoke<string>("pty_cwd", { id: ptyId(pane.id) });
          } catch {}
        }
        presets = [...presets.filter((p) => p.name !== name), { name, cwd, cmd: leaf?.startCmd }];
        scheduleSave();
      });
    }),
    menuItem("Save selection as snippet…", !pane.term.hasSelection(), () => {
      // Capture now: focusing the menu's text input can collapse the selection.
      const code = pane.term.getSelection();
      swapToInput(paneMenuEl, "snippet name", "", (name) => {
        if (!name || !code) return;
        snippets = withSnippet(snippets, {
          id: newSnippetId(), name, code, pinned: false,
          order: snippets.length, created: new Date().toISOString(),
        });
        saveSnippets();
      });
    }),
    menuItem("Close pane", false, () => closeFocused()),
    menuItem(`Broadcast input: ${t.broadcast ? "on" : "off"}`, false, () => toggleBroadcast()),
    menuItem(pane.logging ? "Stop logging output" : "Log output to file", false, () =>
      togglePaneLog(pane),
    ),
    menuItem("Add watch trigger…", false, () => {
      const commitTrigger = (v: string) => {
        if (!v) return;
        const t = compileTrigger(v, "");
        if (typeof t === "string") {
          swapToInput(paneMenuEl, t, "", commitTrigger);
          return;
        }
        pane.triggers.push(t);
      };
      swapToInput(paneMenuEl, "regex or text to watch for", "", commitTrigger);
    }),
    menuItem(`Clear watch triggers (${pane.triggers.length})`, pane.triggers.length === 0, () => {
      pane.triggers = [];
    }),
    menuItem(visual.mode === "cockpit" ? "Cockpit mode off" : "Cockpit mode on", false, () =>
      setMode(visual.mode === "crt" ? "cockpit" : "crt"),
    ),
    menuItem("Config…", false, () => {
      configScreen.toggle();
      refreshVisual();
    }),
    menuItem("Fullscreen", false, () => {
      const w = getCurrentWindow();
      w.isFullscreen().then((fs) => w.setFullscreen(!fs)).catch(() => {});
    }),
  );
  placeMenu(paneMenuEl, x, y);
}

function openTabMenu(index: number, x: number, y: number) {
  const tab = tabs[index];
  if (!tab) return;
  tabMenuEl.innerHTML = "";
  tabMenuEl.append(
    menuItem("Rename space…", false, () => {
      swapToInput(tabMenuEl, "space name", tab.title, (v) => {
        if (v) {
          tab.title = v;
          renderChrome();
          scheduleSave();
        }
      });
    }),
    menuItem("Close space", false, () => closeTab(index)),
  );
  placeMenu(tabMenuEl, x, y);
}

function openPresetMenu() {
  presetMenuEl.innerHTML = "";
  presetMenuEl.append(menuItem("Plain space", false, () => newTab()));
  for (const p of presets) {
    presetMenuEl.append(
      menuItem(`${p.name}  (${p.spaces ? `${p.spaces.length} spaces` : (p.cmd ?? p.cwd)})`, false, () => openPreset(p)),
    );
  }
  if (presets.length === 0) {
    presetMenuEl.append(
      menuItem("(no presets yet: right-click a pane to save one)", true, () => {}),
    );
  }
  const { plus } = tabColumnRects(crtCanvas.getBoundingClientRect(), tabs.length);
  placeMenu(presetMenuEl, plus.x + plus.w + 10, plus.y);
}

document.addEventListener("mousedown", (e) => {
  const t = e.target as Node;
  if (!paneMenuEl.contains(t) && !presetMenuEl.contains(t) && !tabMenuEl.contains(t)) {
    hideMenus();
  }
});

// ---------- settings UI (visual) ----------

const crt = new CrtRenderer(crtCanvas);
crt.settings = crtSettings(effectiveVisual(visual, false));
crt.setContentEl(termContainer);

// One-CRT: in cockpit + retro the widget zones are rasterized into the
// compositor and ride the screen shader with the terminal. The DOM stays in
// layout (opacity 0, via CSS) for hit-testing, like the xterm panes.
const ZONE_ELEMENT_IDS = ["ck-top", "ck-left", "ck-tabs", "ck-right", "ck-bottom"];
const domLayer = new DomLayer(() =>
  ZONE_ELEMENT_IDS.map((id) => document.getElementById(id)!),
);
domLayer.observe(document.getElementById("cockpit")!);
const isOneCrt = () => visual.mode === "cockpit" && visual.renderMode === "retro";

let suppressPersist = false;
function saveVisual() {
  if (suppressPersist) return;
  if (activeConfig) saveStore(withConfig(loadStore(), activeConfig, structuredClone(visual)));
  else localStorage.setItem(STORE_KEY, JSON.stringify(visual));
}

function loadStore(): ConfigStore {
  try {
    return sanitizeStore(JSON.parse(localStorage.getItem(CONFIGS_KEY) ?? "null"));
  } catch {
    return {};
  }
}
function saveStore(s: ConfigStore) {
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(s));
}

/** Replace the live settings wholesale (load a named config, or null = defaults).
 *  persist=false applies to the display without writing over the active config. */
function applyVisual(raw: unknown, persist = true) {
  const r = raw as any;
  const next = { ...sanitizeVisual(r), mode: sanitizeMode(r?.mode), ck: sanitizeCockpit(r?.ck) };
  Object.assign(visual, next);
  sound.setEnabled(visual.ck.sounds);
  suppressPersist = !persist;
  try {
    setMode(visual.mode);
  } finally {
    suppressPersist = false;
  }
  cockpit.relayout();
}

function openWindow(config: string | null) {
  const { label, next } = nextWindowLabel(localStorage.getItem("phosphor-next-win"));
  localStorage.setItem("phosphor-next-win", next);
  const q = new URLSearchParams({ win: label });
  if (config) q.set("config", config);
  new WebviewWindow(label, {
    url: `index.html?${q}`,
    title: config ? `phosphor · ${config}` : "phosphor",
    width: 1100,
    height: 700,
  });
}

function refreshVisual() {
  const e = effectiveVisual(visual, configScreen.open);
  const theme = termTheme(e);
  crt.settings = crtSettings(e);
  crt.setBackground(theme.background);
  // data-fx drives the one-CRT layout switch (full-window canvas + capture,
  // hidden widget DOM); setChrome feeds the widget rasterizer to the shader.
  document.body.dataset.fx = visual.renderMode;
  crt.setChrome(
    isOneCrt()
      ? (ctx, rect, dpr, w, h, now) => domLayer.draw(ctx, rect, dpr, w, h, now)
      : null,
  );
  domLayer.markDirty();
  const root = document.documentElement.style;
  root.setProperty("--tint", theme.foreground);
  root.setProperty("--ck-size", `${visual.ck.widgetSize}px`);
  root.setProperty("--ck-bar-size", `${visual.ck.barSize}px`);
  // The cockpit follows the terminal: one colour scheme drives both, so there
  // is no longer a separate cockpit theme to keep in sync.
  root.setProperty("--ck-fg", theme.foreground);
  root.setProperty("--ck-bg", theme.background);
  root.setProperty("--ck-accent", theme.cursor);
  root.setProperty("--ck-border", `color-mix(in srgb, ${theme.foreground} 30%, black)`);
  root.setProperty("--ck-panel-bg", `color-mix(in srgb, ${theme.background} 82%, transparent)`);
  for (const pane of panes.values()) {
    pane.term.options.theme = theme;
    pane.term.options.fontFamily = FONTS[e.font] ?? FONTS.system;
    pane.term.options.fontSize = e.fontSize;
    pane.term.options.cursorBlink = visual.ck.cursorBlink;
  }
  renderAll();
}

const cockpit = initCockpit(
  {
    runInShell: (cmd) => { focusedPane()?.write(cmd); },
    getSpaces: () =>
      tabs.map((tab, i) => ({
        title: tab.title,
        active: i === activeTabIdx,
        activity:
          paneIds(tab.layout).some((id) => panes.get(id)?.activity) && i !== activeTabIdx,
        attention:
          visual.ck.attention.enabled && visual.ck.attention.badges &&
          spaceAttention(paneIds(tab.layout), (id) => attention.get(id)),
      })),
    selectSpace: (i) => switchTab(i),
    reorderSpace: reorderTabs,
    openSpaceMenu: (i, x, y) => openTabMenu(i, x, y),
    addSpace: () => newTab(),
    getAttention: () =>
      !visual.ck.attention.enabled ? [] : agentRows(attention.all(), (paneId) => {
        const tabIdx = tabs.findIndex((t) => paneIds(t.layout).includes(paneId));
        if (tabIdx === -1) return null;
        const leaf = findLeaf(tabs[tabIdx].layout, paneId);
        return { space: tabs[tabIdx].title, name: leaf?.name ?? attention.get(paneId)?.fgProcess ?? "pane" };
      }),
    jumpToPane: (paneId) => {
      const tabIdx = tabs.findIndex((t) => paneIds(t.layout).includes(paneId));
      if (tabIdx !== -1) {
        switchTab(tabIdx);
        focusPane(paneId);
      }
    },
    getSnippets: () => snippets,
    insertSnippet: (code) => {
      const p = focusedPane();
      if (p) { pasteText(p, code); p.term.focus(); }
    },
    openSnippetLib: () => snippetLib.toggle(),
  },
  () => visual.ck,
  (patch) => { Object.assign(visual.ck, patch); saveVisual(); cockpit.relayout(); },
);
cockpitRef = cockpit;
setOnCwdChange((paneId, path) => {
  const t = activeTab();
  if (t && t.focused === paneId) cockpit.setCwd(path);
});

const shortcuts = new ShortcutsOverlay();

// ---------- command palette ----------

function paletteItems(): PaletteItem[] {
  const items: PaletteItem[] = [];
  tabs.forEach((t, i) =>
    items.push({
      label: `SPACE ${i + 1}: ${t.title}`,
      hint: i === activeTabIdx ? "current" : undefined,
      fn: () => switchTab(i),
    }),
  );
  for (const p of presets) {
    const hint = p.spaces ? `${p.spaces.length} spaces` : (p.cmd ?? p.cwd);
    items.push({ label: `PRESET: OPEN ${p.name}`, hint, fn: () => openPreset(p) });
    items.push({ label: `PRESET: OPEN ${p.name} IN NEW WINDOW`, hint, fn: () => openPresetWindow(p) });
    items.push({ label: `PRESET: DELETE ${p.name}`, fn: () => {
      presets = presets.filter((x) => x.name !== p.name);
      scheduleSave();
    } });
  }
  for (const id of SCHEME_IDS) {
    items.push({
      label: `SCHEME: ${id.toUpperCase()}`,
      fn: () => {
        if (visual.colorScheme === id) return;
        crt.degauss();
        visual.colorScheme = id;
        refreshVisual();
        saveVisual();
      },
    });
  }
  const store = loadStore();
  for (const name of configNames(store)) {
    items.push({
      label: `CONFIG: LOAD ${name}`,
      fn: () => {
        if (activeConfig !== null) {
          activeConfig = name;
          getCurrentWindow().setTitle(`phosphor · ${name}`).catch(() => {});
        }
        applyVisual(store[name]);
        refreshCfgLabel();
      },
    });
    items.push({ label: `CONFIG: DELETE ${name}`, fn: () => saveStore(withoutConfig(loadStore(), name)) });
  }
  items.push(
    {
      label: "CONFIG: SAVE AS…",
      hint: "widgets, scheme, effects, font",
      fn: () => {
        placeMenu(tabMenuEl, Math.round(window.innerWidth / 2) - 110, 80);
        swapToInput(tabMenuEl, "config name", "", (name) => {
          saveStore(withConfig(loadStore(), name, structuredClone(visual)));
        });
      },
    },
    {
      label: "CONFIG: RESET TO DEFAULT",
      hint:
        activeConfig === null
          ? "shipped settings; spaces untouched"
          : `shipped settings; not saved over ${activeConfig} until CONFIG: SAVE AS…`,
      fn: () => applyVisual(null, activeConfig === null),
    },
  );
  items.push({ label: "NEW WINDOW", hint: "same settings as this one", fn: () => openWindow(activeConfig) });
  for (const name of configNames(store)) {
    items.push({ label: `NEW WINDOW: ${name}`, fn: () => openWindow(name) });
  }
  items.push({
    label: "PRESET: SAVE CURRENT SPACES AS…",
    hint: `${tabs.length} space${tabs.length === 1 ? "" : "s"}`,
    fn: () => {
      placeMenu(tabMenuEl, Math.round(window.innerWidth / 2) - 110, 80);
      swapToInput(tabMenuEl, "preset name", "", (name) => {
        if (!name) return;
        presets = [...presets.filter((p) => p.name !== name), snapshotPreset(name, currentSpaceSpecs())];
        scheduleSave();
      });
    },
  });
  items.push(
    { label: "NEW SPACE", fn: () => newTab() },
    { label: "SPLIT RIGHT", fn: () => splitFocused("h") },
    { label: "SPLIT DOWN", fn: () => splitFocused("v") },
    { label: "CLOSE PANE", fn: () => closeFocused() },
    { label: "UNDO CLOSE PANE", fn: () => undoClose() },
    { label: `BROADCAST INPUT ${activeTab()?.broadcast ? "OFF" : "ON"}`, fn: () => toggleBroadcast() },
    { label: "FIND IN SCROLLBACK", fn: () => openSearch() },
    { label: "GLOBAL SEARCH", fn: () => globalSearchOverlay.show() },
    {
      label: visual.mode === "cockpit" ? "COCKPIT MODE OFF" : "COCKPIT MODE ON",
      fn: () => setMode(visual.mode === "crt" ? "cockpit" : "crt"),
    },
    { label: "CONFIG", fn: () => { configScreen.toggle(); refreshVisual(); } },
    {
      label: "FULLSCREEN",
      fn: () => {
        const w = getCurrentWindow();
        w.isFullscreen().then((fs) => w.setFullscreen(!fs)).catch(() => {});
      },
    },
    { label: "SHORTCUT HELP", fn: () => shortcuts.toggle() },
    { label: "SNIPPET LIBRARY", fn: () => snippetLib.toggle() },
  );
  for (const s of snippets) {
    items.push({ label: `SNIPPET: ${s.name}`, fn: () => insertSnippet(s.code) });
  }
  return items;
}

const palette = new Palette(paletteItems, () => focusedPane()?.term.focus());

const configScreen = new ConfigScreen(
  {
    get: () => ({
      renderMode: visual.renderMode, colorScheme: visual.colorScheme,
      effects: { ...visual.effects },
      font: visual.font, fontSize: visual.fontSize,
      widgetSize: visual.ck.widgetSize, barSize: visual.ck.barSize,
      sidebars: visual.ck.sidebars, cursorBlink: visual.ck.cursorBlink,
      pasteGuard: visual.ck.pasteGuard,
      boot: visual.ck.boot, sounds: visual.ck.sounds,
      brand: visual.ck.brand, bar: visual.ck.bar.map((b) => ({ ...b })),
      attention: { ...visual.ck.attention },
    }),
    apply(patch) {
      if (patch.renderMode !== undefined) visual.renderMode = patch.renderMode;
      if (patch.colorScheme !== undefined && patch.colorScheme !== visual.colorScheme) {
        crt.degauss(); // a real tube complains when you re-magnetize it
        visual.colorScheme = patch.colorScheme;
      }
      if (patch.effects !== undefined) visual.effects = patch.effects;
      if (patch.font !== undefined) visual.font = patch.font;
      if (patch.fontSize !== undefined) visual.fontSize = patch.fontSize;
      if (patch.widgetSize !== undefined) visual.ck.widgetSize = patch.widgetSize;
      if (patch.barSize !== undefined) visual.ck.barSize = patch.barSize;
      if (patch.sidebars !== undefined) visual.ck.sidebars = patch.sidebars;
      if (patch.cursorBlink !== undefined) visual.ck.cursorBlink = patch.cursorBlink;
      if (patch.pasteGuard !== undefined) visual.ck.pasteGuard = patch.pasteGuard;
      if (patch.boot !== undefined) visual.ck.boot = patch.boot;
      if (patch.sounds !== undefined) visual.ck.sounds = patch.sounds;
      if (patch.brand !== undefined) visual.ck.brand = patch.brand;
      if (patch.bar !== undefined) visual.ck.bar = patch.bar;
      if (patch.attention !== undefined) { visual.ck.attention = patch.attention; pushTray(); }
      sound.setEnabled(visual.ck.sounds);
      cockpit.relayout();
      refreshVisual();
      saveVisual();
    },
  },
  KEY_HINT,
  () => {
    refreshVisual();
    focusedPane()?.term.focus();
  },
);

function insertSnippet(code: string) {
  const p = focusedPane();
  if (p) {
    pasteText(p, code);
    p.term.focus();
  }
}

const snippetLib = new SnippetLib({
  get: () => snippets,
  set: (next) => {
    snippets = next;
    saveSnippets();
  },
  insert: insertSnippet,
});

function setMode(m: Mode) {
  visual.mode = m;
  document.body.dataset.mode = m;
  crt.degauss();
  refreshVisual();
  cockpit.onModeChange(m);
  saveVisual();
  renderAll();          // grid resize changes pane pixel sizes
}

// ---------- demo mode ----------

function demoWorkspace() {
  tauriAlive = false;
  let layout: LayoutNode = { pane: 1 };
  layout = splitPane(layout, 1, "h", 2);
  layout = splitPane(layout, 2, "v", 3);
  layout = updateLeaf(layout, 1, { cwd: "/Users/tanderson/work", startCmd: "claude" });
  layout = updateLeaf(layout, 3, { startCmd: "tokscale" });
  nextPaneId = 4;
  for (const id of [1, 2, 3]) panes.set(id, new Pane(id));
  tabs.push({ title: "crew", layout, focused: 1 });
  tabs.push({ title: "scratch", layout: { pane: 4 }, focused: 4 });
  panes.set(4, new Pane(4));
  nextPaneId = 5;

  panes.get(1)!.term.write(
    "\x1b[1m$ claude\x1b[0m\r\nsession for \x1b[36mtanderson@metacortex\x1b[0m\r\n\x1b[32m✓\x1b[0m agent ready\r\n",
  );
  panes.get(2)!.term.write(
    "$ ls\r\n\x1b[34mdocs\x1b[0m  \x1b[34msrc\x1b[0m  \x1b[32mbuild.sh\x1b[0m  README.md\r\n$ █",
  );
  panes.get(3)!.term.write(
    "\x1b[1m$ tokscale\x1b[0m\r\ntokens today: \x1b[33m1.2M\x1b[0m\r\nburn rate: \x1b[31m▂▄▆█\x1b[0m\r\n",
  );
  panes.get(4)!.term.write("$ █");
  panes.get(3)!.activity = true;
}

// ---------- boot ----------

async function boot() {
  await document.fonts.ready;

  if (!crt.start()) {
    termContainer.classList.add("raw");
  }

  let restored = false;
  try {
    const raw = await invoke<string>("workspace_load", wsArgs());
    let ws: WorkspaceFile;
    const handoff = parsePresetHandoff(localStorage.getItem("phosphor-open-preset"));
    if (handoff) localStorage.removeItem("phosphor-open-preset");
    if (!raw && handoff) {
      // window opened FOR a preset (palette: OPEN IN NEW WINDOW): its spaces
      // replace the default empty one. Only ever fires on a fresh label.
      ws = {
        version: 3,
        tabs: handoff.spaces.map((s, i) => ({
          title: s.title,
          layout: { pane: i + 1, cwd: s.cwd || undefined, startCmd: s.cmd },
        })),
        activeTab: 0,
        presets: [],
      };
      lastPreset = handoff.name;
    } else if (!raw) {
      ws = defaultWorkspace();
    } else {
      try {
        ws = sanitizeWorkspace(JSON.parse(raw));
      } catch {
        await invoke("workspace_quarantine", wsArgs()).catch(() => {});
        ws = defaultWorkspace();
      }
    }
    presets = ws.presets;
    nextPaneId = maxPaneId(ws) + 1;
    for (const tabCfg of ws.tabs) {
      tabs.push(buildTab(tabCfg.title, tabCfg.layout));
    }
    activeTabIdx = ws.activeTab;
    restored = true;
  } catch {
    // no Tauri backend (plain browser): demo workspace so visuals are checkable
    demoWorkspace();
  }

  try {
    const raw = await invoke<string>("snippets_load");
    if (raw) {
      try {
        snippets = sanitizeSnippets(JSON.parse(raw));
      } catch {
        await invoke("snippets_quarantine").catch(() => {});
        snippets = [];
      }
    }
  } catch {
    // no Tauri backend: snippets stay empty, same as the demo workspace path
  }

  refreshVisual();
  refreshCfgLabel();
  document.body.dataset.mode = visual.mode;
  if (visual.mode === "cockpit") cockpit.onModeChange("cockpit");
  doRender();
  focusedPane()?.term.focus();

  new ResizeObserver(() => renderAll()).observe(termContainer);
  wireCapture();

  if (restored && tauriAlive) {
    setInterval(refreshCwds, 30000);
    const pollForeground = async () => {
      if (!visual.ck.attention.enabled) return;
      const t = activeTab();
      if (!t) return;
      // Poll every pane in the window, not just the active space; a background
      // space is exactly where attention matters.
      const ids = tabs.flatMap((tab) => paneIds(tab.layout)).filter((id) => panes.get(id)?.alive);
      if (ids.length === 0) return;
      try {
        const fg = await invoke<Record<string, string>>("pty_foreground", {
          ids: ids.map((id) => ptyId(id)),
        });
        for (const id of ids) {
          const comm = fg[String(ptyId(id))];
          if (comm) attention.apply({ kind: "fg", paneId: id, process: comm }, Date.now());
        }
      } catch {}
    };
    setInterval(pollForeground, 2000);
    window.addEventListener("beforeunload", () => {
      invoke("workspace_save", { json: JSON.stringify(currentWorkspace(), null, 2), ...wsArgs() }).catch(
        () => {},
      );
    });
    try {
      getCurrentWindow().onCloseRequested(() => {
        for (const p of panes.values()) p.dispose();
      });
    } catch {}
    try {
      getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === "drop" && e.payload.paths.length) {
          const pane = focusedPane();
          if (pane) {
            insertPaths(pane, e.payload.paths);
            pane.term.focus();
          }
        }
      });
    } catch {}
  }

  // menu/edit paste lands here; Cmd+V is handled in handleKey
  document.addEventListener("paste", (e) => {
    const pane = focusedPane();
    if (!pane) return;
    e.preventDefault();
    const items = e.clipboardData?.items ?? [];
    for (const item of items) {
      const file = item.kind === "file" ? item.getAsFile() : null;
      if (file) {
        file.arrayBuffer().then((buf) =>
          invoke<string>("save_inbox_file", {
            name: file.name || "pasted.png",
            bytes: Array.from(new Uint8Array(buf)),
          }).then((p) => insertPaths(pane, [p])),
        );
        return;
      }
    }
    const text = e.clipboardData?.getData("text");
    if (text) pasteText(pane, text);
  });
}

boot();
