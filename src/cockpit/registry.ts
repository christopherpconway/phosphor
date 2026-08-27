// src/cockpit/registry.ts
// Widget factories. The v2 panels that survived (traffic, globe, statusbar)
// stay untouched internally and are wrapped; everything else lives in widgets/.
import { NetworkPanel } from "./network.ts";
import { GlobePanel } from "./globe.ts";
import { BottomBar } from "./clock.ts";
import { shellQuote } from "../textutils.ts";
import { createClockBlock, createClockMini } from "./widgets/clock.ts";
import { createHwInfo } from "./widgets/hwinfo.ts";
import { createCpuPerCore } from "./widgets/cpu.ts";
import { createMemoryMatrix } from "./widgets/memory.ts";
import { createProcs } from "./widgets/procs.ts";
import { createSnippets } from "./widgets/snippets.ts";
import { createAgents, type AttentionRow } from "./widgets/agents.ts";
import { createNetStatus } from "./widgets/netstatus.ts";
import { createFsTree, type FsTreeWidget } from "./widgets/fstree.ts";
import { createSpaces, type SpaceInfo, type SpacesWidget } from "./widgets/spaces.ts";
import { createKeyboard } from "./widgets/keyboard.ts";
import { createDiskWidget } from "./widgets/disk.ts";
import { createRadar } from "./widgets/radar.ts";
import { createTokens } from "./widgets/tokburn.ts";
import { createLogTail } from "./widgets/logtail.ts";
import { createCountdown, createStopwatch, createTimer } from "./widgets/timers.ts";
import { createShortcutsWidget } from "./widgets/shortcuts.ts";
import type { CockpitCfg } from "./config.ts";
import type { Stats } from "./stats.ts";
import type { Snippet } from "../snippets.ts";
import { kindOf, WIDGET_TITLES, type Widget } from "./widget.ts";

export interface WidgetDeps {
  runInShell(cmd: string): void;
  getCfg(): CockpitCfg;
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

/** Marks a widget's drag handle: its panel header if present, else the root.
 *  Dragging itself is pointer-based (wirePointerDrag): HTML5 DnD proved
 *  unreliable in WKWebView even with the setData/user-drag fixes. */
export function attachDragHandle(w: Widget): void {
  w.root.dataset.widget = w.id;
  // A widget without a header must supply an explicit .ck-grip; falling back
  // to the root would make every child a drag source and swallow its clicks.
  const handle =
    (w.root.querySelector(".ck-grip, header") as HTMLElement | null) ?? w.root;
  handle.classList.add("ck-draghandle");
}

export function buildWidget(id: string, deps: WidgetDeps): Widget {
  let w: Widget;
  switch (kindOf(id)) {
    case "spaces":
      w = createSpaces({
        getSpaces: deps.getSpaces,
        selectSpace: deps.selectSpace,
        reorderSpace: deps.reorderSpace,
        openMenu: deps.openSpaceMenu,
        addSpace: deps.addSpace,
      });
      break;
    case "clock":
      w = createClockBlock(deps.getCfg().clockTz[id] ?? "");
      break;
    case "clockmini":
      w = createClockMini(deps.getCfg().clockTz[id] ?? "");
      break;
    case "hwinfo":
      w = createHwInfo();
      break;
    case "cpu":
      w = createCpuPerCore();
      break;
    case "memory":
      w = createMemoryMatrix();
      break;
    case "procs":
      w = createProcs();
      break;
    case "snippets":
      w = createSnippets({
        getSnippets: deps.getSnippets,
        insertSnippet: deps.insertSnippet,
        openSnippetLib: deps.openSnippetLib,
      });
      break;
    case "agents":
      w = createAgents({ getRows: deps.getAttention, jump: deps.jumpToPane });
      break;
    case "netstatus":
      w = createNetStatus();
      break;
    case "disk":
      w = createDiskWidget();
      break;
    case "radar":
      w = createRadar();
      break;
    case "tokens":
      w = createTokens();
      break;
    case "logtail":
      w = createLogTail(deps.getCfg().logPaths[id] ?? "");
      break;
    case "timer":
      w = createTimer(() => deps.getCfg().timerSecs);
      break;
    case "stopwatch":
      w = createStopwatch();
      break;
    case "countdown":
      w = createCountdown(() => deps.getCfg().countdown);
      break;
    case "keyboard":
      w = createKeyboard({ write: (data) => deps.runInShell(data) });
      break;
    case "files":
      w = createFsTree({
        // Browsing inserts a path; only the explicit chord moves the shell.
        insertPath: (p) => deps.runInShell(`${shellQuote(p)} `),
        cdTo: (p) => deps.runInShell(`cd ${shellQuote(p)}\r`),
      });
      break;
    case "traffic": {
      const p = new NetworkPanel();
      w = {
        id,
        title: WIDGET_TITLES.traffic,
        root: p.root,
        onStats: (s) => p.update(s),
        setStale: (on) => p.setStale(on),
      };
      break;
    }
    case "globe": {
      const p = new GlobePanel();
      // Unmounted means the widget is disabled: stop geolocating until it returns.
      const refresh = () => {
        if (p.root.isConnected) p.refresh();
      };
      p.refresh();
      setInterval(refresh, 30000);
      w = { id, title: WIDGET_TITLES.globe, root: p.root };
      break;
    }
    case "statusbar": {
      const p = new BottomBar();
      p.setConfig(deps.getCfg().bar, deps.getCfg().brand);
      fetch("https://ipwho.is/")
        .then((r) => r.json())
        .then((j) => p.setExternalIp(typeof j.ip === "string" ? j.ip : ""))
        .catch(() => {});
      w = {
        id,
        title: WIDGET_TITLES.statusbar,
        root: p.root,
        onStats: (s: Stats) => p.update(s),
      };
      (w as Widget & { barPanel?: BottomBar }).barPanel = p;
      break;
    }
    case "shortcuts":
      w = createShortcutsWidget();
      break;
  }
  w.id = id; // instance id, so drag/close address this copy, not its kind
  attachDragHandle(w);
  return w;
}

export type { FsTreeWidget, SpacesWidget, SpaceInfo };
