// STORAGE: one segmented cell bar per mounted volume (root + externals).
// Cells, not gradients: the one-CRT rasterizer replays background colours,
// so discrete blocks survive the trip onto the tube.
import { makePanel } from "../sysmon.ts";
import { formatBytes, type DiskInfo, type Stats } from "../stats.ts";
import type { Widget } from "../widget.ts";

export const DISK_CELLS = 24;
export const DISK_WARN_FRAC = 0.9;

export function diskFrac(d: DiskInfo): number {
  return d.total > 0 ? Math.min(1, d.used / d.total) : 0;
}

export function litCells(frac: number, cells = DISK_CELLS): number {
  if (frac <= 0) return 0;
  return Math.max(1, Math.round(frac * cells));
}

export function diskLine(d: DiskInfo): string {
  return `${formatBytes(d.used)} / ${formatBytes(d.total)}  ${Math.round(diskFrac(d) * 100)}%`;
}

interface Row {
  root: HTMLElement;
  name: HTMLElement;
  line: HTMLElement;
  cells: HTMLElement[];
}

function buildRow(): Row {
  const root = document.createElement("div");
  root.className = "ck-disk";
  const head = document.createElement("div");
  head.className = "ck-disk-head";
  const name = document.createElement("span");
  const line = document.createElement("span");
  head.append(name, line);
  const track = document.createElement("div");
  track.className = "ck-disk-cells";
  const cells: HTMLElement[] = [];
  for (let i = 0; i < DISK_CELLS; i++) {
    const c = document.createElement("i");
    track.append(c);
    cells.push(c);
  }
  root.append(head, track);
  return { root, name, line, cells };
}

export function createDiskWidget(): Widget {
  const panel = makePanel("STORAGE");
  const rows: Row[] = [];

  return {
    id: "disk",
    title: "STORAGE",
    root: panel.root,
    onStats(s: Stats) {
      const disks = s.disks ?? [];
      while (rows.length < disks.length) {
        const r = buildRow();
        rows.push(r);
        panel.body.append(r.root);
      }
      while (rows.length > disks.length) {
        rows.pop()!.root.remove();
      }
      disks.forEach((d, i) => {
        const r = rows[i];
        const frac = diskFrac(d);
        const lit = litCells(frac);
        const warn = frac >= DISK_WARN_FRAC;
        r.name.textContent = d.name.toUpperCase();
        r.line.textContent = diskLine(d);
        r.line.classList.toggle("warn", warn);
        r.cells.forEach((c, j) => {
          c.className = j < lit ? (warn ? "on warn" : "on") : "";
        });
      });
    },
    setStale: (on) => panel.setStale(on),
  };
}
