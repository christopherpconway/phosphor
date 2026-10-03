// Cockpit mode config. Pure; persistence stays in main.ts's visual store.
import { DEFAULT_LAYOUT, sanitizeWidgets, type WidgetLayout, type Zone } from "./widget.ts";

export type Mode = "crt" | "cockpit";

export const SEGMENT_IDS = [
  "brand", "time", "date", "up", "bat", "lan", "ts", "wan", "wifi", "cfg", "att",
] as const;
export type SegmentId = (typeof SEGMENT_IDS)[number];

export interface BarItem {
  id: SegmentId;
  on: boolean;
}

export const DEFAULT_BAR: BarItem[] = SEGMENT_IDS.map((id) => ({ id, on: true }));

export type Sidebars = "both" | "left" | "right" | "none";

export interface CockpitCfg {
  boot: boolean;
  sounds: boolean;
  brand: string;
  bar: BarItem[];
  widgets: WidgetLayout;
  /** Clock instance id -> IANA timezone. Missing or "" means local time. */
  clockTz: Record<string, string>;
  /** Log widget instance id -> file path to tail. */
  logPaths: Record<string, string>;
  /** Timer widget duration, seconds. */
  timerSecs: number;
  /** Countdown target (ISO local datetime) and its label. */
  countdown: { target: string; label: string };
  /** Base font size for widget text, in px. Everything else scales off it. */
  widgetSize: number;
  /** Status bar font size, in px — independent of the widget size. */
  barSize: number;
  sidebars: Sidebars;
  cursorBlink: boolean;
  /** Pane status row under the space tabs instead of below the panes. */
  statusTop: boolean;
  /**
   * Multi-line pastes are previewed before they reach the shell (PH-4).
   * Off by default (Chris, 2026-08-19): the confirm step got in the way more
   * often than it caught anything. Toggle it on in the config screen.
   */
  pasteGuard: boolean;
  /** Attention detection: master switch, tray icon, tab badges, chime. */
  attention: AttentionCfg;
}

export interface AttentionCfg {
  enabled: boolean;
  tray: boolean;
  badges: boolean;
  sound: boolean;
}

export const DEFAULT_COCKPIT: CockpitCfg = {
  boot: true,
  sounds: true,
  brand: "",
  bar: DEFAULT_BAR,
  widgets: DEFAULT_LAYOUT,
  clockTz: {},
  logPaths: {},
  timerSecs: 25 * 60,
  countdown: { target: "", label: "" },
  widgetSize: 11,
  barSize: 12,
  sidebars: "both",
  cursorBlink: true,
  statusTop: false,
  pasteGuard: false,
  attention: { enabled: true, tray: true, badges: true, sound: false },
};

const SIDEBAR_VALUES: readonly Sidebars[] = ["both", "left", "right", "none"];

/** Only the side columns are gated; full-width zones always render. */
export function zoneVisible(zone: Zone, sidebars: Sidebars): boolean {
  if (zone === "left") return sidebars === "both" || sidebars === "left";
  if (zone === "right") return sidebars === "both" || sidebars === "right";
  return true;
}

export function sanitizeSidebars(raw: unknown): Sidebars {
  return (SIDEBAR_VALUES as readonly string[]).includes(raw as string)
    ? (raw as Sidebars)
    : "both";
}

export const WIDGET_SIZE_MIN = 9;
export const WIDGET_SIZE_MAX = 20;
export const BAR_SIZE_MIN = 9;
export const BAR_SIZE_MAX = 24;

export function sanitizeWidgetSize(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_COCKPIT.widgetSize;
  return Math.min(WIDGET_SIZE_MAX, Math.max(WIDGET_SIZE_MIN, Math.round(raw)));
}

export function sanitizeBarSize(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_COCKPIT.barSize;
  return Math.min(BAR_SIZE_MAX, Math.max(BAR_SIZE_MIN, Math.round(raw)));
}

function sanitizeBar(raw: unknown): BarItem[] {
  const out: BarItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const it of raw) {
      if (typeof it !== "object" || it === null) continue;
      const o = it as Record<string, unknown>;
      if (!(SEGMENT_IDS as readonly string[]).includes(o.id as string)) continue;
      if (seen.has(o.id as string)) continue;
      seen.add(o.id as string);
      out.push({ id: o.id as SegmentId, on: o.on !== false });
    }
  }
  for (const id of SEGMENT_IDS) {
    if (!seen.has(id)) out.push({ id, on: true });
  }
  return out;
}

/** A timezone survives only if Intl actually accepts it. */
export function sanitizeClockTz(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string" || v === "") continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: v });
      out[k] = v;
    } catch {}
  }
  return out;
}

/** Plain string map: instance id -> value. Non-strings and empties dropped. */
export function sanitizeStringMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

export function sanitizeCountdown(raw: unknown): { target: string; label: string } {
  if (typeof raw !== "object" || raw === null) return { target: "", label: "" };
  const o = raw as Record<string, unknown>;
  const target = typeof o.target === "string" && !Number.isNaN(Date.parse(o.target)) ? o.target : "";
  const label = typeof o.label === "string" ? o.label.slice(0, 24) : "";
  return { target, label };
}

export function sanitizeAttention(raw: unknown): AttentionCfg {
  const d = { ...DEFAULT_COCKPIT.attention };
  if (typeof raw !== "object" || raw === null) return d;
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled === "boolean") d.enabled = o.enabled;
  if (typeof o.tray === "boolean") d.tray = o.tray;
  if (typeof o.badges === "boolean") d.badges = o.badges;
  if (typeof o.sound === "boolean") d.sound = o.sound;
  return d;
}

export function sanitizeCockpit(raw: unknown): CockpitCfg {
  const d = {
    ...DEFAULT_COCKPIT,
    bar: DEFAULT_BAR.map((b) => ({ ...b })),
    widgets: sanitizeWidgets(undefined),
    clockTz: {},
    logPaths: {},
    countdown: { target: "", label: "" },
    attention: { ...DEFAULT_COCKPIT.attention },
  };
  if (typeof raw !== "object" || raw === null) return d;
  const o = raw as Record<string, unknown>;
  if (typeof o.boot === "boolean") d.boot = o.boot;
  if (typeof o.sounds === "boolean") d.sounds = o.sounds;
  if (typeof o.brand === "string") d.brand = o.brand.slice(0, 24);
  d.bar = sanitizeBar(o.bar);
  d.widgets = sanitizeWidgets(o.widgets);
  d.clockTz = sanitizeClockTz(o.clockTz);
  d.logPaths = sanitizeStringMap(o.logPaths);
  if (typeof o.timerSecs === "number" && Number.isFinite(o.timerSecs) && o.timerSecs > 0) {
    d.timerSecs = Math.min(24 * 3600, Math.round(o.timerSecs));
  }
  d.countdown = sanitizeCountdown(o.countdown);
  d.widgetSize = sanitizeWidgetSize(o.widgetSize);
  d.barSize = sanitizeBarSize(o.barSize);
  d.sidebars = sanitizeSidebars(o.sidebars);
  if (typeof o.cursorBlink === "boolean") d.cursorBlink = o.cursorBlink;
  if (typeof o.statusTop === "boolean") d.statusTop = o.statusTop;
  if (typeof o.pasteGuard === "boolean") d.pasteGuard = o.pasteGuard;
  d.attention = sanitizeAttention(o.attention);
  return d;
}

export const sanitizeMode = (raw: unknown): Mode => (raw === "cockpit" ? "cockpit" : "crt");
