// One channel subscription fans out to panels. Panels never call Rust for
// periodic data; they receive Stats ticks from here.
import { Channel, invoke } from "@tauri-apps/api/core";

export interface ProcInfo { pid: number; name: string; cpu: number }
export interface NetInfo { name: string; rx: number; tx: number }
export interface DiskInfo { name: string; mount: string; total: number; used: number }
export interface Stats {
  cpus: number[];
  loadAvg: number;
  memUsed: number;
  memTotal: number;
  procs: ProcInfo[];
  nets: NetInfo[];
  tempC: number | null;
  battery: { percent: number; charging: boolean } | null;
  uptimeSecs: number;
  lanIp: string | null;
  tsIp: string | null;
  wifiSsid: string | null;
  swapUsed: number;
  swapTotal: number;
  cpuFreqMhz: number | null;
  pingMs: number | null;
  taskCount: number;
  activeIface: string | null;
  disks: DiskInfo[];
}

export const TICK_SECS = 2;
const STALE_MS = 6000;

export function startStats(onTick: (s: Stats) => void, onStale: () => void): void {
  let channel: Channel<Stats>;
  try {
    channel = new Channel<Stats>();
  } catch {
    // No Tauri backend (plain-browser demo): stay on NO DATA rather than
    // throwing inside cockpit build() and aborting boot before wireCapture.
    return;
  }
  let staleTimer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(wentStale, STALE_MS);
  };
  // The collector refuses a second subscriber while one is live, and only
  // notices a dead channel on its next send. A dev reload lands inside that
  // window, so the first invoke is dropped and no ticks ever arrive. Retry
  // on every stale beat; it stops as soon as ticks resume.
  const wentStale = () => {
    onStale();
    invoke("stats_stream", { channel }).catch(() => {});
    arm();
  };
  channel.onmessage = (s) => {
    arm();
    onTick(s);
  };
  arm();
  invoke("stats_stream", { channel }).catch(() => {
    if (staleTimer) clearTimeout(staleTimer);
    wentStale();
  });
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(n: number): string {
  if (n <= 0) return "0 B";
  let u = 0;
  let v = n;
  while (v >= 1024 && u < UNITS.length - 1) {
    v /= 1024;
    u++;
  }
  return u === 0 ? `${Math.round(v)} B` : `${v.toFixed(1)} ${UNITS[u]}`;
}

export function formatRate(bytesPerTick: number, tickSecs: number): string {
  return `${formatBytes(bytesPerTick / tickSecs)}/s`;
}

export function formatUptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatUptimeDDHHMM(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${pad2(d)}:${pad2(h)}:${pad2(m)}`;
}

export function formatDate(d: Date): string {
  return d
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .replace(",", "")
    .toUpperCase();
}
