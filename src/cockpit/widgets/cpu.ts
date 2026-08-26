// Per-core usage bars, paired two-up like eDEX, over a TEMP/MIN/MAX/TASKS line.
import { makePanel } from "../sysmon.ts";
import type { Stats } from "../stats.ts";
import type { Widget } from "../widget.ts";

/** Core indices paired two-up; an odd core count leaves a null partner. */
export function pairCores(n: number): Array<[number, number | null]> {
  const out: Array<[number, number | null]> = [];
  for (let i = 0; i < n; i += 2) out.push([i, i + 1 < n ? i + 1 : null]);
  return out;
}

export function createCpuPerCore(): Widget {
  const panel = makePanel("CPU");
  const grid = document.createElement("div");
  grid.className = "ck-cpu-grid";
  const facts = document.createElement("div");
  facts.className = "ck-fact-line";
  panel.body.append(grid, facts);

  let fills: HTMLElement[] = [];

  const rebuild = (cores: number) => {
    grid.innerHTML = "";
    fills = [];
    for (const pair of pairCores(cores)) {
      const rowEl = document.createElement("div");
      rowEl.className = "ck-cpu-pair";
      for (const core of pair) {
        const cell = document.createElement("div");
        cell.className = "ck-cpu-cell";
        if (core === null) {
          cell.classList.add("empty");
        } else {
          const label = document.createElement("span");
          label.className = "ck-cpu-label";
          label.textContent = String(core + 1).padStart(2, "0");
          const track = document.createElement("div");
          track.className = "ck-cpu-track";
          const fill = document.createElement("div");
          fill.className = "ck-cpu-fill";
          track.append(fill);
          cell.append(label, track);
          fills[core] = fill;
        }
        rowEl.append(cell);
      }
      grid.append(rowEl);
    }
  };

  return {
    id: "cpu",
    title: "CPU",
    root: panel.root,
    onStats(s: Stats) {
      if (fills.length !== s.cpus.length) rebuild(s.cpus.length);
      s.cpus.forEach((pct, i) => {
        const fill = fills[i];
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      });
      const freq = s.cpuFreqMhz;
      facts.textContent =
        `TEMP ${s.tempC === null ? "N/A" : `${Math.round(s.tempC)}C`}` +
        `  FREQ ${freq === null ? "N/A" : `${freq} MHZ`}` +
        `  TASKS ${s.taskCount}`;
    },
    setStale: (on) => panel.setStale(on),
  };
}
