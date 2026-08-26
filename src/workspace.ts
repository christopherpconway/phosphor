// Workspace file model + validation. IO happens in main.ts via Tauri commands.

import { isLeaf, type LayoutNode } from "./layout.ts";

export interface SpaceSpec {
  title: string;
  cwd: string;
  cmd?: string;
}

export interface Preset {
  name: string;
  cwd: string;
  cmd?: string;
  /** Multi-space launcher (two-nouns ruling). Absent = the single space above. */
  spaces?: SpaceSpec[];
}

export interface TabCfg {
  title: string;
  layout: LayoutNode;
}

export interface WorkspaceFile {
  version: 3;
  tabs: TabCfg[];
  activeTab: number;
  presets: Preset[];
}

export function defaultWorkspace(): WorkspaceFile {
  return {
    version: 3,
    tabs: [{ title: "term 1", layout: { pane: 1 } }],
    activeTab: 0,
    presets: [],
  };
}

function validNode(n: unknown): n is LayoutNode {
  if (typeof n !== "object" || n === null) return false;
  const o = n as Record<string, unknown>;
  if ("pane" in o) {
    return (
      typeof o.pane === "number" &&
      (o.cwd === undefined || typeof o.cwd === "string") &&
      (o.startCmd === undefined || typeof o.startCmd === "string") &&
      (o.name === undefined || typeof o.name === "string")
    );
  }
  return (
    (o.split === "h" || o.split === "v") &&
    typeof o.ratio === "number" &&
    o.ratio > 0 &&
    o.ratio < 1 &&
    validNode(o.a) &&
    validNode(o.b)
  );
}

function validSpace(s: unknown): s is SpaceSpec {
  if (typeof s !== "object" || s === null) return false;
  const o = s as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.cwd === "string" && (o.cmd === undefined || typeof o.cmd === "string");
}

function validPreset(p: unknown): p is Preset {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.cwd === "string" &&
    (o.cmd === undefined || typeof o.cmd === "string") &&
    (o.spaces === undefined || (Array.isArray(o.spaces) && o.spaces.length > 0 && o.spaces.every(validSpace)))
  );
}

/** Every preset is a list of spaces to open; a legacy single preset is a list of one. */
export function presetSpaces(p: Preset): SpaceSpec[] {
  return p.spaces ?? [{ title: p.cmd ?? p.name, cwd: p.cwd, cmd: p.cmd }];
}

/** Snapshot the current spaces as one preset; the first space is mirrored at the top level. */
export function snapshotPreset(name: string, spaces: SpaceSpec[]): Preset {
  const first = spaces[0] ?? { title: name, cwd: "", cmd: undefined };
  return { name, cwd: first.cwd, cmd: first.cmd, spaces: spaces.map((s) => ({ ...s })) };
}

/** Parse an untrusted workspace file; any structural problem falls back safely. */
export function sanitizeWorkspace(raw: unknown): WorkspaceFile {
  const def = defaultWorkspace();
  if (typeof raw !== "object" || raw === null) return def;
  const o = raw as Record<string, unknown>;

  const tabs: TabCfg[] = Array.isArray(o.tabs)
    ? o.tabs
        .filter(
          (t): t is TabCfg =>
            typeof t === "object" &&
            t !== null &&
            typeof (t as TabCfg).title === "string" &&
            validNode((t as TabCfg).layout),
        )
        .map((t) => ({ title: t.title, layout: t.layout }))
    : [];
  if (tabs.length === 0) return def;

  const activeTab =
    typeof o.activeTab === "number" && o.activeTab >= 0 && o.activeTab < tabs.length
      ? Math.floor(o.activeTab)
      : 0;

  const presets: Preset[] = Array.isArray(o.presets) ? o.presets.filter(validPreset) : [];

  return { version: 3, tabs, activeTab, presets };
}

/** One-shot preset handoff to a freshly opened window (palette: OPEN IN NEW
 *  WINDOW). Serialized into localStorage by the opener, consumed at boot. */
export interface PresetHandoff {
  name: string;
  spaces: SpaceSpec[];
}

export function parsePresetHandoff(raw: string | null): PresetHandoff | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.name !== "string" || !Array.isArray(o.spaces) || o.spaces.length === 0) return null;
    if (!o.spaces.every(validSpace)) return null;
    return { name: o.name, spaces: o.spaces as SpaceSpec[] };
  } catch {
    return null;
  }
}

/** Highest pane id used anywhere in the file (for seeding the id counter). */
export function maxPaneId(ws: WorkspaceFile): number {
  let max = 0;
  const walk = (n: LayoutNode) => {
    if (isLeaf(n)) max = Math.max(max, n.pane);
    else {
      walk(n.a);
      walk(n.b);
    }
  };
  ws.tabs.forEach((t) => walk(t.layout));
  return max;
}

/** New array with item `from` moved to index `to`. No-op copy on bad indices (PH-1). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from === to || from < 0 || to < 0 || from >= out.length || to >= out.length) return out;
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}
