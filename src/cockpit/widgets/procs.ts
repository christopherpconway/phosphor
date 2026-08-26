// Top processes by CPU. Fixed row count so the panel height never jumps.
import { makePanel } from "../sysmon.ts";
import type { ProcInfo, Stats } from "../stats.ts";
import type { Widget } from "../widget.ts";

const ROWS = 8;

/** Hottest processes first; ties resolve by pid so the order does not flicker. */
export function topProcs(procs: ProcInfo[], n: number): ProcInfo[] {
  return [...procs]
    .sort((a, b) => b.cpu - a.cpu || a.pid - b.pid)
    .slice(0, n);
}

export function createProcs(): Widget {
  const panel = makePanel("PROCESSES");
  const table = document.createElement("table");
  table.className = "ck-procs";
  const head = document.createElement("tr");
  for (const label of ["PID", "NAME", "CPU"]) {
    const th = document.createElement("th");
    th.textContent = label;
    head.append(th);
  }
  table.append(head);

  const rows: Array<{ pid: HTMLElement; name: HTMLElement; cpu: HTMLElement }> = [];
  for (let i = 0; i < ROWS; i++) {
    const tr = document.createElement("tr");
    const pid = document.createElement("td");
    const name = document.createElement("td");
    name.className = "ck-proc-name";
    const cpu = document.createElement("td");
    tr.append(pid, name, cpu);
    table.append(tr);
    rows.push({ pid, name, cpu });
  }
  const empty = document.createElement("div");
  empty.className = "ck-fact-line";
  empty.textContent = "NO DATA";
  panel.body.append(table, empty);

  return {
    id: "procs",
    title: "PROCESSES",
    root: panel.root,
    onStats(s: Stats) {
      const top = topProcs(s.procs, ROWS);
      empty.classList.toggle("hidden", top.length > 0);
      rows.forEach((row, i) => {
        const p = top[i];
        row.pid.textContent = p ? String(p.pid) : "";
        row.name.textContent = p ? p.name : "";
        row.cpu.textContent = p ? `${p.cpu.toFixed(1)}%` : "";
      });
    },
    setStale: (on) => panel.setStale(on),
  };
}
