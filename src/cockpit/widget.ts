// Pure widget model: ids, zones, layout config. No DOM at module scope.
import type { Stats } from "./stats.ts";

export type WidgetId =
  | "spaces" | "clock" | "clockmini" | "hwinfo" | "cpu" | "memory"
  | "procs" | "agents" | "netstatus" | "globe" | "traffic" | "files"
  | "keyboard" | "statusbar" | "disk" | "tokens" | "radar" | "logtail"
  | "timer" | "stopwatch" | "countdown" | "shortcuts";
export type Zone = "top" | "left" | "tabs" | "right" | "bottom";

// Order matters twice: config listings, and sanitizeWidgets appends missing
// ids to their default zones in this order, which must reproduce DEFAULT_LAYOUT.
export const WIDGET_IDS: readonly WidgetId[] = [
  "spaces", "clock", "clockmini", "hwinfo", "cpu", "memory", "disk", "tokens",
  "timer", "stopwatch", "countdown",
  "procs", "agents", "netstatus", "globe", "radar", "traffic", "files",
  "keyboard", "logtail", "statusbar", "shortcuts",
];
export const ZONES: readonly Zone[] = ["top", "left", "tabs", "right", "bottom"];

// ---- widget instances ----
// Zone lists hold instance ids. A base widget's instance id is its kind
// ("clock"); extra copies of a multi-instance kind get "kind@N" (N >= 2).
// Base ids are toggled via `enabled`; extra instances exist only while listed,
// so closing one removes it outright.

export const MULTI_INSTANCE: readonly WidgetId[] = ["clockmini", "logtail"];

export const kindOf = (id: string): WidgetId => id.split("@")[0] as WidgetId;
export const isBaseId = (id: string): boolean => !id.includes("@");

const isInstanceId = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  const at = v.indexOf("@");
  if (at === -1) return isWidgetId(v);
  const kind = v.slice(0, at);
  return (
    isWidgetId(kind) &&
    MULTI_INSTANCE.includes(kind as WidgetId) &&
    /^[2-9]\d*$/.test(v.slice(at + 1))
  );
};

/** Next free instance id for a kind, scanning every zone. */
export function newInstanceId(l: WidgetLayout, kind: WidgetId): string {
  let max = 1;
  for (const z of ZONES) {
    for (const id of l.zone[z]) {
      if (kindOf(id) !== kind) continue;
      const n = isBaseId(id) ? 1 : Number(id.split("@")[1]);
      if (n > max) max = n;
    }
  }
  return `${kind}@${max + 1}`;
}

export function addInstance(l: WidgetLayout, kind: WidgetId, zone: Zone): { layout: WidgetLayout; id: string } {
  const id = newInstanceId(l, kind);
  const next = cloneLayout(l);
  next.zone[zone].push(id);
  return { layout: next, id };
}

export function removeInstance(l: WidgetLayout, id: string): WidgetLayout {
  const next = cloneLayout(l);
  for (const z of ZONES) {
    next.zone[z] = next.zone[z].filter((w) => w !== id);
  }
  return next;
}

/**
 * Widgets that may only ever live in one zone. Tabs that are not adjacent to
 * the thing they switch stop reading as tabs, so the spaces strip is pinned
 * directly above the terminal rather than being freely placeable.
 */
export const PINNED_ZONE: Partial<Record<WidgetId, Zone>> = { spaces: "tabs" };

const pinnedIdsFor = (z: Zone): WidgetId[] =>
  (Object.keys(PINNED_ZONE) as WidgetId[]).filter((id) => PINNED_ZONE[id] === z);

/** Display names, so config rows read like the panel headers they control. */
export const WIDGET_TITLES: Record<WidgetId, string> = {
  spaces: "SPACES",
  clock: "CLOCK",
  clockmini: "CLOCK MINI",
  hwinfo: "HARDWARE",
  cpu: "CPU",
  memory: "MEMORY",
  procs: "PROCESSES",
  agents: "AGENTS",
  netstatus: "NETWORK",
  globe: "GLOBE",
  traffic: "NETWORK TRAFFIC",
  files: "FILES",
  keyboard: "KEYBOARD",
  statusbar: "STATUS",
  disk: "STORAGE",
  tokens: "TOKENS TODAY",
  radar: "RADAR",
  logtail: "LOG",
  timer: "TIMER",
  stopwatch: "STOPWATCH",
  countdown: "COUNTDOWN",
  shortcuts: "SHORTCUTS",
};

export interface Widget {
  /** Instance id ("clock", "clock@2"), not necessarily a bare kind. */
  id: string;
  title: string;
  root: HTMLElement;
  onStats?(s: Stats): void;
  onSecond?(now: Date): void;
  setStale?(on: boolean): void;
}

export interface WidgetLayout {
  zone: Record<Zone, string[]>;
  enabled: Record<WidgetId, boolean>;
}

const DEFAULT_ZONE: Record<WidgetId, Zone> = {
  spaces: "tabs",
  clock: "left",
  clockmini: "left",
  hwinfo: "left",
  cpu: "left",
  memory: "left",
  procs: "left",
  agents: "right",
  netstatus: "right",
  globe: "right",
  traffic: "right",
  files: "bottom",
  keyboard: "bottom",
  statusbar: "bottom",
  disk: "left",
  tokens: "left",
  radar: "right",
  logtail: "bottom",
  timer: "left",
  stopwatch: "left",
  countdown: "left",
  shortcuts: "bottom",
};

/** Off by default: the compact clock duplicates CLOCK, the keyboard is opt-in. */
const DEFAULT_ENABLED: Record<WidgetId, boolean> = {
  spaces: true,
  clock: true,
  clockmini: false,
  hwinfo: true,
  cpu: true,
  memory: true,
  procs: true,
  agents: true,
  netstatus: true,
  globe: true,
  traffic: true,
  files: true,
  keyboard: false,
  statusbar: true,
  disk: true,
  tokens: true,
  radar: true,
  /** Off until a file is chosen; an empty LOG panel helps nobody. */
  logtail: false,
  /** Time tools are opt-in via the + menu. */
  timer: false,
  stopwatch: false,
  countdown: false,
  /** Opt-in; the help overlay covers the same table on demand. */
  shortcuts: false,
};

export const DEFAULT_LAYOUT: WidgetLayout = {
  zone: {
    top: [],
    tabs: ["spaces"],
    left: [
      "clock", "clockmini", "hwinfo", "cpu", "memory", "disk", "tokens",
      "timer", "stopwatch", "countdown", "procs",
    ],
    right: ["agents", "netstatus", "globe", "radar", "traffic"],
    bottom: ["files", "keyboard", "logtail", "statusbar", "shortcuts"],
  },
  enabled: { ...DEFAULT_ENABLED },
};

const cloneLayout = (l: WidgetLayout): WidgetLayout => ({
  zone: {
    top: [...l.zone.top], left: [...l.zone.left], tabs: [...l.zone.tabs],
    right: [...l.zone.right], bottom: [...l.zone.bottom],
  },
  enabled: { ...l.enabled },
});

const isWidgetId = (v: unknown): v is WidgetId =>
  (WIDGET_IDS as readonly string[]).includes(v as string);

export function sanitizeWidgets(raw: unknown): WidgetLayout {
  const d = cloneLayout(DEFAULT_LAYOUT);
  if (typeof raw !== "object" || raw === null) return d;
  const o = raw as Record<string, unknown>;
  const zoneRaw = (typeof o.zone === "object" && o.zone !== null ? o.zone : {}) as Record<string, unknown>;
  const enabledRaw = (typeof o.enabled === "object" && o.enabled !== null ? o.enabled : {}) as Record<string, unknown>;

  const seen = new Set<string>();
  const zone: Record<Zone, string[]> = { top: [], left: [], tabs: [], right: [], bottom: [] };
  for (const z of ZONES) {
    const list = Array.isArray(zoneRaw[z]) ? (zoneRaw[z] as unknown[]) : [];
    for (const id of list) {
      if (isInstanceId(id) && !seen.has(id as string)) {
        seen.add(id as string);
        zone[z].push(id as string);
      }
    }
  }
  for (const id of WIDGET_IDS) {
    if (!seen.has(id)) zone[DEFAULT_ZONE[id]].push(id);
  }

  // A stored config that misplaces a pinned widget is corrected, not honoured.
  for (const [id, home] of Object.entries(PINNED_ZONE) as Array<[WidgetId, Zone]>) {
    for (const z of ZONES) {
      if (z !== home) zone[z] = zone[z].filter((w) => w !== id);
    }
    if (!zone[home].includes(id)) zone[home].push(id);
  }
  // Nothing else may squat in a pinned zone. Evicted widgets go home to their
  // default zone; dropping them would make a widget vanish from the config.
  for (const z of ZONES) {
    const allowed = pinnedIdsFor(z);
    if (allowed.length === 0) continue;
    const evicted = zone[z].filter((w) => !(allowed as string[]).includes(w));
    zone[z] = zone[z].filter((w) => (allowed as string[]).includes(w));
    for (const id of evicted) {
      const kind = kindOf(id);
      const home = DEFAULT_ZONE[kind] === z ? "left" : DEFAULT_ZONE[kind];
      zone[home].push(id);
    }
  }

  const enabled = {} as Record<WidgetId, boolean>;
  for (const id of WIDGET_IDS) {
    const stored = enabledRaw[id];
    enabled[id] = typeof stored === "boolean" ? stored : DEFAULT_ENABLED[id];
  }
  return { zone, enabled };
}

export function moveWithinZone(l: WidgetLayout, zone: Zone, index: number, delta: number): WidgetLayout {
  const j = index + delta;
  const list = l.zone[zone];
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return l;
  const next = cloneLayout(l);
  [next.zone[zone][index], next.zone[zone][j]] = [next.zone[zone][j], next.zone[zone][index]];
  return next;
}

export function moveToZone(l: WidgetLayout, id: string, zone: Zone, index: number): WidgetLayout {
  // A pinned widget cannot leave its home, and no one else may enter it.
  const home = PINNED_ZONE[kindOf(id)];
  if (home !== undefined && zone !== home) return l;
  if (home === undefined && pinnedIdsFor(zone).length > 0) return l;
  const next = cloneLayout(l);
  for (const z of ZONES) {
    next.zone[z] = next.zone[z].filter((w) => w !== id);
  }
  const list = next.zone[zone];
  list.splice(Math.min(Math.max(0, index), list.length), 0, id);
  return next;
}

export function setEnabled(l: WidgetLayout, id: WidgetId, on: boolean): WidgetLayout {
  const next = cloneLayout(l);
  next.enabled[id] = on;
  return next;
}

export function zoneOf(l: WidgetLayout, id: string): Zone {
  for (const z of ZONES) {
    if (l.zone[z].includes(id)) return z;
  }
  return "left";
}

export function cycleZone(l: WidgetLayout, id: string, dir: 1 | -1): WidgetLayout {
  if (PINNED_ZONE[kindOf(id)] !== undefined) return l;
  // Step past pinned zones rather than stalling on them.
  let cur = ZONES.indexOf(zoneOf(l, id));
  for (let i = 0; i < ZONES.length; i++) {
    cur = (cur + dir + ZONES.length) % ZONES.length;
    const nz = ZONES[cur];
    if (pinnedIdsFor(nz).length === 0) return moveToZone(l, id, nz, l.zone[nz].length);
  }
  return l;
}

export function dropIndex(midpoints: number[], pos: number): number {
  for (let i = 0; i < midpoints.length; i++) {
    if (pos < midpoints[i]) return i;
  }
  return midpoints.length;
}
