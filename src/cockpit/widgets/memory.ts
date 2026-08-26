// eDEX dot-matrix memory fill, plus a USING/OUT OF line and swap.
import { makePanel } from "../sysmon.ts";
import { formatBytes, type Stats } from "../stats.ts";
import type { Widget } from "../widget.ts";

const CELLS = 120;

/** How many matrix cells to light. Zero total means unknown, not full. */
export function litCells(used: number, total: number, cells: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(cells, Math.round((used / total) * cells)));
}

export function createMemoryMatrix(): Widget {
  const panel = makePanel("MEMORY");
  const matrix = document.createElement("div");
  matrix.className = "ck-matrix";
  const cells: HTMLElement[] = [];
  for (let i = 0; i < CELLS; i++) {
    const c = document.createElement("i");
    matrix.append(c);
    cells.push(c);
  }
  const usage = document.createElement("div");
  usage.className = "ck-fact-line";
  usage.textContent = "NO DATA";
  const swap = document.createElement("div");
  swap.className = "ck-fact-line";
  swap.textContent = "SWAP NO DATA";
  panel.body.append(matrix, usage, swap);

  return {
    id: "memory",
    title: "MEMORY",
    root: panel.root,
    onStats(s: Stats) {
      const lit = litCells(s.memUsed, s.memTotal, CELLS);
      cells.forEach((c, i) => c.classList.toggle("on", i < lit));
      usage.textContent =
        s.memTotal > 0
          ? `USING ${formatBytes(s.memUsed)} OUT OF ${formatBytes(s.memTotal)}`
          : "NO DATA";
      swap.textContent =
        s.swapTotal > 0
          ? `SWAP ${formatBytes(s.swapUsed)} / ${formatBytes(s.swapTotal)}`
          : "SWAP NONE";
    },
    setStale: (on) => panel.setStale(on),
  };
}
