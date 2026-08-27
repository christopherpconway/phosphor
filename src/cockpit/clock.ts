// Bottom bar: data-driven segments. A null render hides the segment.
import { formatDate, formatUptimeDDHHMM, type Stats } from "./stats.ts";
import type { BarItem, SegmentId } from "./config.ts";

// ---- threshold alerts ----
// Sustained pressure only: a one-tick CPU spike is normal life, three in a
// row is a problem worth a blinking bar segment.
export const ALERT_CPU_PCT = 85;
export const ALERT_MEM_FRAC = 0.9;
export const ALERT_DISK_FRAC = 0.9;
export const ALERT_CPU_TICKS = 3;

export function alertTexts(s: Stats, hotCpuTicks: number): string[] {
  const out: string[] = [];
  const avg = s.cpus.length ? s.cpus.reduce((a, b) => a + b, 0) / s.cpus.length : 0;
  if (hotCpuTicks >= ALERT_CPU_TICKS) out.push(`CPU ${Math.round(avg)}%`);
  if (s.memTotal > 0 && s.memUsed / s.memTotal >= ALERT_MEM_FRAC) {
    out.push(`MEM ${Math.round((s.memUsed / s.memTotal) * 100)}%`);
  }
  for (const d of s.disks ?? []) {
    if (d.total > 0 && d.used / d.total >= ALERT_DISK_FRAC) {
      out.push(`DISK ${d.name.toUpperCase()} ${Math.round((d.used / d.total) * 100)}%`);
    }
  }
  return out;
}

export function cpuIsHot(s: Stats): boolean {
  const avg = s.cpus.length ? s.cpus.reduce((a, b) => a + b, 0) / s.cpus.length : 0;
  return avg >= ALERT_CPU_PCT;
}

export interface SegCtx {
  now: Date;
  stats: Stats | null;
  wanIp: string;
  brand: string;
  cfg: string;
}

// Which config/preset this window runs, set by main.ts. Module-level rather
// than plumbed through the widget registry: the bar re-renders every second
// anyway, so a setter plus a read at render time is the whole contract.
let cfgLabel = "";
export function setCfgLabel(label: string): void {
  cfgLabel = label;
}

// Same module-level pattern as cfgLabel: the attention count comes from the
// store's onChange -> renderChrome flow in main.ts, not from Stats, so it
// needs its own setter rather than riding SegCtx.
let attCount = 0;
export function setAttention(n: number): void {
  attCount = n;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export const SEGMENTS: Record<SegmentId, (c: SegCtx) => string | null> = {
  brand: (c) => (c.brand ? c.brand.toUpperCase() : null),
  time: (c) =>
    `${pad2(c.now.getHours())}:${pad2(c.now.getMinutes())}:${pad2(c.now.getSeconds())}`,
  date: (c) => formatDate(c.now),
  up: (c) => (c.stats ? `UP ${formatUptimeDDHHMM(c.stats.uptimeSecs)}` : null),
  bat: (c) =>
    c.stats?.battery
      ? `BAT ${c.stats.battery.percent}%${c.stats.battery.charging ? " +CHG" : ""}`
      : null,
  lan: (c) => (c.stats?.lanIp ? `LAN ${c.stats.lanIp}` : null),
  ts: (c) => (c.stats?.tsIp ? `TS ${c.stats.tsIp}` : null),
  wan: (c) => (c.wanIp ? `WAN ${c.wanIp}` : null),
  // macOS returns the literal "<redacted>" when the app lacks Location
  // Services permission; showing that helps nobody, so the segment hides.
  wifi: (c) =>
    c.stats?.wifiSsid && c.stats.wifiSsid !== "<redacted>" ? `WIFI ${c.stats.wifiSsid}` : null,
  cfg: (c) => (c.cfg ? c.cfg : null),
  att: () => `ATTN ${attCount}`,
};

export class BottomBar {
  root = document.createElement("div");
  private bar: BarItem[] = [];
  private brand = "";
  private stats: Stats | null = null;
  private wanIp = "";
  private hotCpuTicks = 0;
  private blinkOn = true;

  constructor() {
    this.root.className = "ck-clockstrip";
    setInterval(() => {
      this.blinkOn = !this.blinkOn;
      this.render();
    }, 1000);
  }

  setConfig(bar: BarItem[], brand: string) {
    this.bar = bar;
    this.brand = brand;
    this.render();
  }

  update(s: Stats) {
    this.stats = s;
    this.hotCpuTicks = cpuIsHot(s) ? this.hotCpuTicks + 1 : 0;
    this.render();
  }

  setExternalIp(ip: string) {
    this.wanIp = ip;
    this.render();
  }

  private render() {
    const ctx: SegCtx = { now: new Date(), stats: this.stats, wanIp: this.wanIp, brand: this.brand, cfg: cfgLabel };
    this.root.innerHTML = "";
    for (const item of this.bar) {
      if (!item.on) continue;
      const text = SEGMENTS[item.id](ctx);
      if (text === null) continue;
      const span = document.createElement("span");
      span.textContent = text;
      if (item.id === "brand") span.className = "ck-brand";
      if (item.id === "att") span.className = attCount > 0 ? "ck-att-on" : "ck-att-off";
      this.root.appendChild(span);
    }
    // Alerts are not a configurable segment: when something crosses a
    // threshold it shows, blinking, whether you asked for it or not.
    if (this.stats) {
      for (const text of alertTexts(this.stats, this.hotCpuTicks)) {
        const span = document.createElement("span");
        span.className = "ck-alert" + (this.blinkOn ? "" : " off");
        span.textContent = `⚠ ${text}`;
        this.root.appendChild(span);
      }
    }
  }
}
