// TOKENS TODAY: AI token burn from the local tokscale CLI. Cost up top,
// in/out volumes, and a 24-bin hourly burn chart drawn as cells so the
// one-CRT rasterizer carries it onto the tube. No credentials involved:
// tokscale reads local usage transcripts.
import { invoke } from "@tauri-apps/api/core";
import { makePanel } from "../sysmon.ts";
import type { Widget } from "../widget.ts";

const POLL_MS = 5 * 60 * 1000;

interface HourEntry {
  hour: string;
  input: number;
  output: number;
  cost: number;
}

export interface TokUsage {
  cost: number;
  input: number;
  output: number;
  /** Token volume per hour-of-day, 24 bins. */
  hourly: number[];
}

export function parseTokscale(json: string): TokUsage | null {
  let entries: HourEntry[];
  try {
    const parsed = JSON.parse(json) as { entries?: HourEntry[] };
    if (!Array.isArray(parsed.entries)) return null;
    entries = parsed.entries;
  } catch {
    return null;
  }
  const usage: TokUsage = { cost: 0, input: 0, output: 0, hourly: new Array(24).fill(0) };
  for (const e of entries) {
    usage.cost += e.cost ?? 0;
    usage.input += e.input ?? 0;
    usage.output += e.output ?? 0;
    const h = Number((e.hour ?? "").slice(11, 13));
    if (Number.isInteger(h) && h >= 0 && h < 24) usage.hourly[h] += (e.output ?? 0) + (e.input ?? 0);
  }
  return usage;
}

export function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function createTokens(): Widget {
  const panel = makePanel("TOKENS TODAY");
  const cost = document.createElement("div");
  cost.className = "ck-clock-big";
  cost.textContent = "…";
  const io = document.createElement("div");
  io.className = "ck-fact-line";
  const bars = document.createElement("div");
  bars.className = "ck-tok-bars";
  const cells: HTMLElement[] = [];
  for (let i = 0; i < 24; i++) {
    const c = document.createElement("i");
    bars.append(c);
    cells.push(c);
  }
  panel.body.append(cost, io, bars);

  const render = (u: TokUsage) => {
    cost.textContent = `$${u.cost.toFixed(2)}`;
    io.textContent = `IN ${formatTokens(u.input)}  OUT ${formatTokens(u.output)}`;
    const max = Math.max(1, ...u.hourly);
    u.hourly.forEach((v, i) => {
      cells[i].style.height = `${Math.max(2, Math.round((v / max) * 100))}%`;
      cells[i].classList.toggle("on", v > 0);
    });
    panel.setStale(false);
  };

  const poll = () => {
    if (!panel.root.isConnected) return;
    invoke<string>("tok_usage")
      .then((json) => {
        const u = parseTokscale(json);
        if (u) render(u);
        else panel.setStale(true);
      })
      .catch(() => panel.setStale(true));
  };
  poll();
  setInterval(poll, POLL_MS);

  return { id: "tokens", title: "TOKENS TODAY", root: panel.root };
}
