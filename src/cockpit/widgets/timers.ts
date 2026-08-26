// TIMER / STOPWATCH / COUNTDOWN: three small time tools sharing one chassis.
// Buttons are plain click targets so they work through the one-CRT glass.
// Timer duration and countdown target persist via cockpit config; running
// state is session-only.
import { makePanel } from "../sysmon.ts";
import type { Widget } from "../widget.ts";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "25m", "1h10m", "90s", "10:00", "1:00:00", bare minutes — to seconds. */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => Number(p));
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const units = s.match(/(\d+(?:\.\d+)?)\s*([hms])/g);
  if (units) {
    let total = 0;
    for (const u of units) {
      const n = parseFloat(u);
      total += u.endsWith("h") ? n * 3600 : u.endsWith("m") ? n * 60 : n;
    }
    return Math.round(total) || null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null;
}

export function formatHMSClock(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${pad2(m)}:${pad2(s % 60)}`;
}

/** "12D 04:32:11" for far targets, plain clock inside a day. */
export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "00:00";
  const s = Math.floor(msLeft / 1000);
  const days = Math.floor(s / 86400);
  const rest = formatHMSClock(s % 86400);
  return days > 0 ? `${days}D ${rest.padStart(7, "0")}` : formatHMSClock(s);
}

/** "2026-12-25 17:00 CHRISTMAS" -> target + label. Date first, label after. */
export function parseCountdownTarget(raw: string): { target: string; label: string } | null {
  const s = raw.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?)\s*(.*)$/);
  if (!m) return null;
  const iso = m[1].replace(" ", "T");
  if (Number.isNaN(Date.parse(iso))) return null;
  return { target: iso, label: m[2].trim() };
}

/** Now + 1 h in local time, "YYYY-MM-DDTHH:MM". The countdown's default (PH-6). */
export function defaultCountdownTarget(now: Date): string {
  const d = new Date(now.getTime() + 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function button(label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ck-key wide";
  b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}

function bigReadout(): HTMLElement {
  const el = document.createElement("div");
  el.className = "ck-clock-big";
  return el;
}

export function createStopwatch(): Widget {
  const panel = makePanel("STOPWATCH");
  const big = bigReadout();
  const row = document.createElement("div");
  row.className = "ck-keyrow";
  let running = false;
  let elapsed = 0; // ms banked while stopped
  let startedAt = 0;
  const now = () => (running ? elapsed + (performance.now() - startedAt) : elapsed);
  const render = () => {
    const ms = now();
    const tenths = Math.floor((ms % 1000) / 100);
    big.textContent = `${formatHMSClock(ms / 1000)}.${tenths}`;
  };
  row.append(
    button("START", () => {
      if (running) return;
      startedAt = performance.now();
      running = true;
    }),
    button("STOP", () => {
      if (!running) return;
      elapsed = now();
      running = false;
    }),
    button("RESET", () => {
      running = false;
      elapsed = 0;
      render();
    }),
  );
  panel.body.append(big, row);
  setInterval(() => {
    if (panel.root.isConnected && running) render();
  }, 100);
  render();
  return { id: "stopwatch", title: "STOPWATCH", root: panel.root };
}

export function createTimer(getSecs: () => number): Widget {
  const panel = makePanel("TIMER");
  const big = bigReadout();
  const row = document.createElement("div");
  row.className = "ck-keyrow";
  let running = false;
  let endAt = 0;
  let leftWhenStopped = getSecs() * 1000;
  const left = () => (running ? endAt - performance.now() : leftWhenStopped);
  const render = () => {
    const ms = left();
    big.textContent = formatHMSClock(Math.ceil(ms / 1000));
    // done: hold at zero and blink until reset
    big.classList.toggle("warn", ms <= 0);
    if (ms <= 0) big.style.opacity = Math.floor(performance.now() / 500) % 2 ? "0.25" : "1";
    else big.style.opacity = "1";
  };
  row.append(
    button("START", () => {
      if (running) return;
      if (leftWhenStopped <= 0) leftWhenStopped = getSecs() * 1000;
      endAt = performance.now() + leftWhenStopped;
      running = true;
    }),
    button("STOP", () => {
      if (!running) return;
      leftWhenStopped = Math.max(0, endAt - performance.now());
      running = false;
    }),
    button("RESET", () => {
      running = false;
      leftWhenStopped = getSecs() * 1000;
      render();
    }),
  );
  panel.body.append(big, row);
  setInterval(() => {
    if (panel.root.isConnected) render();
  }, 250);
  render();
  return { id: "timer", title: "TIMER", root: panel.root };
}

export function createCountdown(getTarget: () => { target: string; label: string }): Widget {
  const cfg = getTarget();
  // No target chosen: count to now + 1 h from the moment the widget mounts (PH-6).
  const fallback = defaultCountdownTarget(new Date());
  const panel = makePanel(cfg.label ? cfg.label.toUpperCase() : "COUNTDOWN");
  const big = bigReadout();
  const hint = document.createElement("div");
  hint.className = "ck-fact-line";
  const render = () => {
    const t = getTarget();
    const target = t.target || fallback;
    const msLeft = Date.parse(target) - Date.now();
    big.textContent = formatCountdown(msLeft);
    big.classList.toggle("warn", msLeft <= 0);
    hint.textContent = (t.target ? "" : "default · ") + target.replace("T", " ");
  };
  panel.body.append(big, hint);
  render();
  return {
    id: "countdown",
    title: cfg.label ? cfg.label.toUpperCase() : "COUNTDOWN",
    root: panel.root,
    onSecond: render,
  };
}
