// clock-block: big HH:MM:SS over DATE / UPTIME / TYPE / POWER. Each clock
// instance can carry its own IANA timezone; the title then becomes the city
// and UTC offset. clock-mini: the same clock on one line, for tight layouts.
import { makePanel } from "../sysmon.ts";
import { formatDate, formatUptimeDDHHMM, type Stats } from "../stats.ts";
import type { Widget } from "../widget.ts";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatHMS(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** "America/New_York" -> "NEW YORK". */
export function tzCity(tz: string): string {
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ").toUpperCase();
}

/** "UTC-4", "UTC+5:30"; bare GMT (no offset digits) is UTC+0. */
export function tzOffsetLabel(tz: string, now: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value ?? "";
  return name === "GMT" ? "UTC+0" : name.replace("GMT", "UTC");
}

/** Panel title for a clock instance: local clocks keep the plain fallback. */
export function clockTitle(tz: string, fallback = "CLOCK", now: Date = new Date()): string {
  return tz ? `${tzCity(tz)} ${tzOffsetLabel(tz, now)}` : fallback;
}

/** "LOCAL UTC-4": the machine's own zone, named as such. */
export function localClockTitle(now: Date = new Date()): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `LOCAL ${tzOffsetLabel(zone, now)}`;
  } catch {
    return "LOCAL";
  }
}

/** City-name lookup over the platform's IANA zone list. */
export function searchTimeZones(query: string, zones?: readonly string[], limit = 10): string[] {
  const q = query.trim().toLowerCase().replace(/ /g, "_");
  if (!q) return [];
  const all = zones ?? Intl.supportedValuesOf("timeZone");
  const city = (z: string) => (z.split("/").pop() ?? z).toLowerCase();
  const starts = all.filter((z) => city(z).startsWith(q));
  const contains = all.filter((z) => !city(z).startsWith(q) && z.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

function tzHMS(tz: string): (d: Date) => string {
  if (!tz) return formatHMS;
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return (d) => f.format(d);
}

function tzDate(tz: string): (d: Date) => string {
  if (!tz) return formatDate;
  return (d) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })
      .replace(",", "")
      .toUpperCase();
}

/** ["FRI 08", "AUG"]: the mini clock's stacked date column. */
export function stackedDate(d: Date, tz = ""): [string, string] {
  const opt = (o: Intl.DateTimeFormatOptions) => ({ ...o, ...(tz ? { timeZone: tz } : {}) });
  const wd = d.toLocaleDateString("en-US", opt({ weekday: "short" })).toUpperCase();
  const day = d.toLocaleDateString("en-US", opt({ day: "2-digit" }));
  const mon = d.toLocaleDateString("en-US", opt({ month: "short" })).toUpperCase();
  return [`${wd} ${day}`, mon];
}

function factRow(label: string): { row: HTMLElement; value: HTMLElement } {
  const row = document.createElement("div");
  row.className = "ck-fact";
  const k = document.createElement("span");
  k.className = "k";
  k.textContent = label;
  const value = document.createElement("span");
  value.className = "v";
  value.textContent = "NO DATA";
  row.append(k, value);
  return { row, value };
}

/** No battery line means a desktop Mac, which is on wall power by definition. */
export function powerLabel(b: Stats["battery"]): string {
  if (!b) return "AC";
  return b.charging ? `${b.percent}% CHG` : `${b.percent}%`;
}

export function createClockBlock(tz = ""): Widget {
  const title = tz ? clockTitle(tz) : localClockTitle();
  const panel = makePanel(title);
  const hms = tzHMS(tz);
  const dateFmt = tzDate(tz);
  const big = document.createElement("div");
  big.className = "ck-clock-big";
  big.textContent = hms(new Date());
  const date = factRow("DATE");
  const up = factRow("UPTIME");
  const type = factRow("TYPE");
  type.value.textContent = "MACOS";
  const power = factRow("POWER");
  panel.body.append(big, date.row, up.row, type.row, power.row);

  return {
    id: "clock",
    title,
    root: panel.root,
    onSecond(now) {
      big.textContent = hms(now);
      date.value.textContent = dateFmt(now);
    },
    onStats(s: Stats) {
      up.value.textContent = formatUptimeDDHHMM(s.uptimeSecs);
      power.value.textContent = powerLabel(s.battery);
    },
    setStale: (on) => panel.setStale(on),
  };
}

export function createClockMini(tz = ""): Widget {
  const title = clockTitle(tz, "CLOCK MINI");
  const panel = makePanel(title);
  const hms = tzHMS(tz);
  // Same digit size as the full CLOCK; the date stacks beside the time:
  // SAT / 08 / AUG.
  const row = document.createElement("div");
  row.className = "ck-mini-row";
  const big = document.createElement("div");
  big.className = "ck-clock-big";
  big.textContent = hms(new Date());
  const stack = document.createElement("div");
  stack.className = "ck-mini-date";
  const parts = [document.createElement("span"), document.createElement("span")];
  stack.append(...parts);
  row.append(big, stack);
  panel.body.append(row);

  const setDate = (d: Date) => {
    stackedDate(d, tz).forEach((t, i) => {
      parts[i].textContent = t;
    });
  };
  setDate(new Date());

  return {
    id: "clockmini",
    title,
    root: panel.root,
    onSecond(d) {
      big.textContent = hms(d);
      setDate(d);
    },
  };
}
