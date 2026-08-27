import { plainTextInput } from "../textinput.ts";
// src/cockpit/cockpit.ts
// Zone renderer over the widget registry. Widgets build lazily on first
// cockpit entry; relayout() re-mounts from config without rebuilding.
// Widget management is direct-manipulation: a + button per zone adds,
// right-click closes (and sets clock timezones), dragging reorders.
import { startStats, type Stats } from "./stats.ts";
import { runBootSeq } from "./bootseq.ts";
import { sound } from "./sound.ts";
import { buildWidget } from "./registry.ts";
import { zoneVisible, type CockpitCfg, type Mode } from "./config.ts";
import {
  addInstance, dropIndex, isBaseId, kindOf, moveToZone, removeInstance, setEnabled,
  MULTI_INSTANCE, PINNED_ZONE, WIDGET_IDS, WIDGET_TITLES, ZONES,
  type Widget, type Zone,
} from "./widget.ts";
import { searchTimeZones, tzOffsetLabel } from "./widgets/clock.ts";
import { defaultCountdownTarget, parseCountdownTarget, parseDuration } from "./widgets/timers.ts";
import type { FsTreeWidget } from "./widgets/fstree.ts";
import type { AttentionRow } from "./widgets/agents.ts";
import type { SpaceInfo, SpacesWidget } from "./widgets/spaces.ts";
import type { BottomBar } from "./clock.ts";
import type { Snippet } from "../snippets.ts";

export interface Cockpit {
  onModeChange(m: Mode): void;
  relayout(): void;
  setCwd(path: string): void;
  refreshSpaces(): void;
  getCfg: () => CockpitCfg;
}

export interface CockpitDeps {
  runInShell(cmd: string): void;
  getSpaces(): SpaceInfo[];
  selectSpace(i: number): void;
  reorderSpace(from: number, to: number): void;
  openSpaceMenu(i: number, x: number, y: number): void;
  addSpace(): void;
  getAttention(): AttentionRow[];
  jumpToPane(paneId: number): void;
  getSnippets(): Snippet[];
  insertSnippet(code: string): void;
  openSnippetLib(): void;
}

const ZONE_EL: Record<string, string> = {
  top: "ck-top", left: "ck-left", tabs: "ck-tabs", right: "ck-right", bottom: "ck-bottom",
};

/** Zones that grow a + button. Tabs is pinned-only. */
const ADDABLE_ZONES: readonly Zone[] = ["top", "left", "right", "bottom"];

interface MenuItem {
  label: string;
  fn(): void;
}

export function initCockpit(
  deps: CockpitDeps,
  getCfg: () => CockpitCfg,
  apply: (patch: Partial<CockpitCfg>) => void,
): Cockpit {
  let built = false;
  const live = new Map<string, Widget>();
  const api: Cockpit = { onModeChange, relayout, setCwd, refreshSpaces, getCfg };

  function widget(id: string): Widget {
    let w = live.get(id);
    if (!w) {
      w = buildWidget(id, { ...deps, getCfg });
      live.set(id, w);
    }
    return w;
  }

  // ---- popover (add menu / widget menu / timezone picker) ----

  const menuEl = document.createElement("div");
  menuEl.className = "popover ck-menu hidden";
  document.body.append(menuEl);
  document.addEventListener("mousedown", (e) => {
    if (!menuEl.contains(e.target as Node)) hideMenu();
  });

  function hideMenu() {
    menuEl.classList.add("hidden");
  }

  function placeMenu(x: number, y: number) {
    menuEl.style.left = `${Math.min(x, window.innerWidth - 250)}px`;
    menuEl.style.top = `${Math.min(y, window.innerHeight - 320)}px`;
    menuEl.classList.remove("hidden");
  }

  function showMenu(x: number, y: number, items: MenuItem[]) {
    menuEl.innerHTML = "";
    for (const it of items) {
      const el = document.createElement("div");
      el.className = "item";
      el.textContent = it.label;
      el.addEventListener("click", () => {
        hideMenu();
        it.fn();
      });
      menuEl.append(el);
    }
    placeMenu(x, y);
  }

  /** Bare text input popover; Enter commits, Escape closes. */
  function openTextInput(
    placeholder: string,
    initial: string,
    x: number,
    y: number,
    commit: (v: string) => void,
  ) {
    menuEl.innerHTML = "";
    const input = document.createElement("input");
    plainTextInput(input);
    input.placeholder = placeholder;
    input.value = initial;
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        hideMenu();
        commit(input.value.trim());
      } else if (e.key === "Escape") {
        hideMenu();
      }
    });
    menuEl.append(input);
    placeMenu(x, y);
    setTimeout(() => input.focus(), 0);
  }

  function openLogPicker(id: string, x: number, y: number) {
    openTextInput("/path/to/file.log", getCfg().logPaths[id] ?? "", x, y, (v) => {
      if (!v) return;
      apply({ logPaths: { ...getCfg().logPaths, [id]: v } });
      remount(id);
    });
  }

  function openTimerPicker(x: number, y: number) {
    openTextInput("duration: 25m, 1h10m, 10:00", "", x, y, (v) => {
      const secs = parseDuration(v);
      if (secs === null) return;
      apply({ timerSecs: secs });
      remount("timer");
    });
  }

  function openCountdownPicker(x: number, y: number) {
    const cur = getCfg().countdown;
    const initial = cur.target
      ? `${cur.target.replace("T", " ")} ${cur.label}`.trim()
      : defaultCountdownTarget(new Date()).replace("T", " ");
    openTextInput("2026-12-25 17:00 LABEL", initial, x, y, (v) => {
      const parsed = parseCountdownTarget(v);
      if (!parsed) return;
      apply({ countdown: parsed });
      remount("countdown");
    });
  }

  /** City lookup over the IANA zone list; picking a zone retitles the clock. */
  function openTzPicker(id: string, x: number, y: number) {
    menuEl.innerHTML = "";
    const input = document.createElement("input");
    plainTextInput(input);
    input.placeholder = "city, e.g. tokyo";
    const list = document.createElement("div");
    const commit = (tz: string) => {
      hideMenu();
      apply({ clockTz: { ...getCfg().clockTz, [id]: tz } });
      remount(id);
    };
    const render = () => {
      list.innerHTML = "";
      for (const tz of searchTimeZones(input.value)) {
        const el = document.createElement("div");
        el.className = "item";
        el.textContent = `${tz.replace(/_/g, " ")}  ${tzOffsetLabel(tz)}`;
        el.addEventListener("click", () => commit(tz));
        list.append(el);
      }
    };
    input.addEventListener("input", render);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const first = searchTimeZones(input.value)[0];
        if (first) commit(first);
      } else if (e.key === "Escape") {
        hideMenu();
      }
    });
    menuEl.append(input, list);
    placeMenu(x, y);
    setTimeout(() => input.focus(), 0);
  }

  function openAddMenu(z: Zone, x: number, y: number) {
    const l = getCfg().widgets;
    const items: MenuItem[] = [];
    for (const kind of WIDGET_IDS) {
      if (l.enabled[kind]) continue;
      // A pinned widget is offered everywhere but lands in its home zone.
      const home = PINNED_ZONE[kind] ?? z;
      items.push({
        label: `ADD ${WIDGET_TITLES[kind]}`,
        fn: () => {
          const on = setEnabled(getCfg().widgets, kind, true);
          apply({ widgets: moveToZone(on, kind, home, on.zone[home].length) });
        },
      });
    }
    // Multi-instance kinds always offer another copy; each opens its setup.
    const MULTI_SETUP: Record<string, { label: string; open: (id: string) => void }> = {
      clockmini: { label: "(TIMEZONE)…", open: (id) => openTzPicker(id, x, y) },
      logtail: { label: "(FILE)…", open: (id) => openLogPicker(id, x, y) },
    };
    for (const kind of MULTI_INSTANCE) {
      const setup = MULTI_SETUP[kind];
      items.push({
        label: `ADD ${WIDGET_TITLES[kind]} ${setup?.label ?? ""}`.trim(),
        fn: () => {
          const { layout, id } = addInstance(getCfg().widgets, kind, z);
          apply({ widgets: layout });
          setup?.open(id);
        },
      });
    }
    showMenu(x, y, items);
  }

  function closeWidget(id: string) {
    const cfg = getCfg();
    if (isBaseId(id)) {
      apply({ widgets: setEnabled(cfg.widgets, kindOf(id), false) });
      return;
    }
    const { [id]: _tz, ...clockTz } = cfg.clockTz;
    const { [id]: _lp, ...logPaths } = cfg.logPaths;
    apply({ widgets: removeInstance(cfg.widgets, id), clockTz, logPaths });
    live.get(id)?.root.remove();
    live.delete(id);
  }

  /** Rebuild one widget from config (e.g. after its timezone changed). */
  function remount(id: string) {
    const w = live.get(id);
    if (w) {
      w.root.remove();
      live.delete(id);
    }
    lastLayoutKey = "";
    relayout();
  }

  function wireContextMenu() {
    for (const z of ZONES) {
      const el = document.getElementById(ZONE_EL[z])!;
      el.addEventListener("contextmenu", (e) => {
        const root = (e.target as HTMLElement).closest?.("[data-widget]") as HTMLElement | null;
        if (!root) return;
        e.preventDefault();
        const id = root.dataset.widget!;
        const items: MenuItem[] = [];
        const kind = kindOf(id);
        if (kind === "clock" || kind === "clockmini") {
          items.push({ label: "Set timezone…", fn: () => openTzPicker(id, e.clientX, e.clientY) });
        } else if (kind === "logtail") {
          items.push({ label: "Set log file…", fn: () => openLogPicker(id, e.clientX, e.clientY) });
        } else if (kind === "timer") {
          items.push({ label: "Set duration…", fn: () => openTimerPicker(e.clientX, e.clientY) });
        } else if (kind === "countdown") {
          items.push({ label: "Set countdown…", fn: () => openCountdownPicker(e.clientX, e.clientY) });
        }
        items.push({
          label: `Close ${live.get(id)?.title ?? WIDGET_TITLES[kindOf(id)]}`,
          fn: () => closeWidget(id),
        });
        showMenu(e.clientX, e.clientY, items);
      });
    }
  }

  // ---- layout ----

  let lastLayoutKey = "";

  function makeAddButton(z: Zone): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ck-add";
    btn.textContent = "+";
    btn.title = "Add widget";
    btn.addEventListener("click", (e) => openAddMenu(z, e.clientX, e.clientY));
    return btn;
  }

  function relayout() {
    if (!built) return;
    const layout = getCfg().widgets;
    // Re-mounting detaches every root, which resets scroll and blurs focus.
    // Config applies fire on every slider step, so skip the churn when the
    // layout itself has not moved.
    const sidebars = getCfg().sidebars;
    const key = JSON.stringify(layout) + sidebars;
    if (key !== lastLayoutKey) {
      lastLayoutKey = key;
      document.getElementById("cockpit")!.dataset.sidebars = sidebars;
      for (const z of ZONES) {
        const el = document.getElementById(ZONE_EL[z])!;
        el.innerHTML = "";
        // A hidden sidebar's widgets are never constructed.
        if (!zoneVisible(z, sidebars)) continue;
        for (const id of layout.zone[z]) {
          // Base widgets honour the enabled toggle; extra instances exist
          // only while listed, so their presence is their toggle.
          if (isBaseId(id) && !layout.enabled[kindOf(id)]) continue;
          el.appendChild(widget(id).root);
        }
        if (ADDABLE_ZONES.includes(z)) el.appendChild(makeAddButton(z));
      }
    }
    // statusbar config may have changed too
    const bar = (live.get("statusbar") as (Widget & { barPanel?: BottomBar }) | undefined)?.barPanel;
    bar?.setConfig(getCfg().bar, getCfg().brand);
  }

  function setCwd(path: string) {
    (live.get("files") as FsTreeWidget | undefined)?.setCwd(path);
  }

  function refreshSpaces() {
    (live.get("spaces") as SpacesWidget | undefined)?.refresh();
  }

  // Pointer-based drag: HTML5 DnD never fired reliably in WKWebView (see
  // errors-log 2026-08-07), so grabbing a handle tracks the pointer directly.
  function wirePointerDrag() {
    const marker = document.createElement("div");
    marker.className = "ck-dropmark";
    let dragId: string | null = null;
    let started = false;
    let sx = 0;
    let sy = 0;
    let sourceRoot: HTMLElement | null = null;

    const horizontal = (z: Zone) => z === "top" || z === "bottom" || z === "tabs";

    /** Zone under the pointer; hidden zones have zero-width rects and never match. */
    const zoneAt = (x: number, y: number): Zone | null => {
      for (const z of ZONES) {
        const r = document.getElementById(ZONE_EL[z])!.getBoundingClientRect();
        if (r.width > 0 && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
          return z;
        }
      }
      return null;
    };

    // The + button is a zone child but not a drop slot; only widget roots count.
    const widgetKids = (el: HTMLElement, skip: string): HTMLElement[] =>
      [...el.children].filter(
        (c) => c !== marker && (c as HTMLElement).dataset.widget && (c as HTMLElement).dataset.widget !== skip,
      ) as HTMLElement[];

    const dropSlot = (z: Zone, x: number, y: number, skip: string) => {
      const el = document.getElementById(ZONE_EL[z])!;
      const kids = widgetKids(el, skip);
      const mids = kids.map((k) => {
        const r = k.getBoundingClientRect();
        return horizontal(z) ? r.x + r.width / 2 : r.y + r.height / 2;
      });
      return { el, kids, idx: dropIndex(mids, horizontal(z) ? x : y) };
    };

    const reset = () => {
      sourceRoot?.classList.remove("ck-dragging");
      sourceRoot = null;
      dragId = null;
      started = false;
      marker.remove();
    };

    // Mouse events, not pointer events: in one-CRT mode the capture layer
    // replays synthetic MouseEvents onto the hidden DOM, and those must be
    // able to start and drive a drag.
    document.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const handle = (e.target as HTMLElement).closest?.(".ck-draghandle") as HTMLElement | null;
      if (!handle) return;
      const root = handle.closest("[data-widget]") as HTMLElement | null;
      if (!root) return;
      dragId = root.dataset.widget!;
      sourceRoot = root;
      started = false;
      sx = e.clientX;
      sy = e.clientY;
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragId) return;
      // A dead-zone before the drag starts keeps plain clicks working.
      if (!started) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return;
        started = true;
        sourceRoot?.classList.add("ck-dragging");
      }
      const z = zoneAt(e.clientX, e.clientY);
      if (!z) {
        marker.remove();
        return;
      }
      const { el, kids, idx } = dropSlot(z, e.clientX, e.clientY, dragId);
      el.insertBefore(marker, kids[idx] ?? null);
    });
    document.addEventListener("mouseup", (e) => {
      const id = dragId;
      const wasStarted = started;
      reset();
      if (!id || !wasStarted) return;
      const z = zoneAt(e.clientX, e.clientY);
      if (!z) return;
      const { idx } = dropSlot(z, e.clientX, e.clientY, id);
      apply({ widgets: moveToZone(getCfg().widgets, id, z, idx) });
    });
  }

  function build() {
    built = true;
    const cfg = getCfg();
    // Sounds are no longer gated on a cockpit theme: there is one colour
    // scheme now, and the beeps belong to the cockpit, not to a palette.
    sound.setEnabled(cfg.sounds);
    if (cfg.boot) runBootSeq(() => {});
    relayout();
    wirePointerDrag();
    wireContextMenu();
    // A widget disabled after being built stays in `live` but leaves the DOM;
    // driving it wastes work and, for globe, keeps its network polling alive.
    const mounted = () => [...live.values()].filter((w) => w.root.isConnected);
    startStats(
      (s: Stats) => {
        for (const w of mounted()) {
          w.setStale?.(false);
          w.onStats?.(s);
        }
      },
      () => {
        for (const w of mounted()) w.setStale?.(true);
      },
    );
    setInterval(() => {
      const now = new Date();
      for (const w of mounted()) w.onSecond?.(now);
    }, 1000);
  }

  function onModeChange(m: Mode) {
    if (m === "cockpit" && !built) build();
  }

  return api;
}
