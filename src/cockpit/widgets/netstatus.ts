// Link state at a glance: STATE / INTERFACE / IPV4 / PING.
import { makePanel } from "../sysmon.ts";
import type { NetInfo, Stats } from "../stats.ts";
import type { Widget } from "../widget.ts";

export type NetStateLabel = "ONLINE" | "OFFLINE" | "DEGRADED";

/** Stale ticks mean the collector is gone; a missing ping means no route out. */
export function netState(stale: boolean, pingMs: number | null): NetStateLabel {
  if (stale) return "OFFLINE";
  return pingMs === null ? "DEGRADED" : "ONLINE";
}

/**
 * Interface to display. The collector's `nets` list carries 2-second deltas
 * and drops idle interfaces, so ranking by traffic makes the label vanish on
 * an idle link and flip between en0/utun/awdl when it does not. Prefer the
 * interface that owns the LAN address; fall back to traffic only without one.
 */
export function activeInterface(activeIface: string | null, nets: NetInfo[]): string {
  if (activeIface) return activeIface;
  if (nets.length === 0) return "NONE";
  return nets.reduce((a, b) => (b.rx + b.tx > a.rx + a.tx ? b : a)).name;
}

export function createNetStatus(): Widget {
  const panel = makePanel("NETWORK");
  const cells: Record<string, HTMLElement> = {};
  for (const label of ["STATE", "INTERFACE", "IPV4", "PING"]) {
    const row = document.createElement("div");
    row.className = "ck-fact";
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "v";
    v.textContent = "NO DATA";
    row.append(k, v);
    panel.body.append(row);
    cells[label] = v;
  }

  let stale = false;
  let lastPing: number | null = null;

  const paintState = () => {
    const label = netState(stale, lastPing);
    cells.STATE.textContent = label;
    cells.STATE.dataset.state = label.toLowerCase();
  };

  return {
    id: "netstatus",
    title: "NETWORK",
    root: panel.root,
    onStats(s: Stats) {
      stale = false;
      lastPing = s.pingMs;
      paintState();
      cells.INTERFACE.textContent = activeInterface(s.activeIface, s.nets);
      cells.IPV4.textContent = s.lanIp ?? "NO DATA";
      cells.PING.textContent = s.pingMs === null ? "N/A" : `${s.pingMs} MS`;
    },
    setStale(on) {
      stale = on;
      panel.setStale(on);
      paintState();
    },
  };
}
