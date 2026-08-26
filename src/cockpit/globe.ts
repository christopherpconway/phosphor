// src/cockpit/globe.ts
// Hand-drawn orthographic wireframe globe. Connection dots geolocated via
// https://ipwho.is (free, HTTPS, no key); offline just means no dots.
// Continent outlines from ./coastlines.ts (Natural Earth 110m); no lat/lon grid (PH-5).
import { invoke } from "@tauri-apps/api/core";
import { makePanel } from "./sysmon.ts";
import { COASTLINES } from "./coastlines.ts";

export function projectLatLon(latDeg: number, lonDeg: number, rotDeg: number) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = ((lonDeg - rotDeg) * Math.PI) / 180;
  return {
    x: Math.cos(lat) * Math.sin(lon),
    y: Math.sin(lat),
    front: Math.cos(lat) * Math.cos(lon) > 0,
  };
}

/** Front-facing consecutive runs of a [lat,lon,...] polyline, in unit-disc coords. */
export function visibleRuns(poly: readonly number[], rotDeg: number): { x: number; y: number }[][] {
  const runs: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const p = projectLatLon(poly[i], poly[i + 1], rotDeg);
    if (p.front) cur.push({ x: p.x, y: p.y });
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

interface Dot { lat: number; lon: number }

export class GlobePanel {
  root: HTMLElement;
  private panel = makePanel("GLOBE");
  private canvas = document.createElement("canvas");
  private dots: Dot[] = [];
  private geoCache = new Map<string, Dot | null>();
  private rot = 0;

  constructor() {
    this.root = this.panel.root;
    this.canvas.className = "ck-globe";
    this.canvas.height = 180;
    this.panel.body.append(this.canvas);
    let lastDraw = 0;
    // ponytail: cheap no-op reschedule when hidden/off-cadence beats
    // cancelling and re-arming the rAF chain on mode switches.
    const tick = (t: number) => {
      if (document.body.dataset.mode === "cockpit" && t - lastDraw >= 33) {
        lastDraw = t;
        this.rot = (this.rot + 0.15) % 360;
        this.draw();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async refresh() {
    if (document.body.dataset.mode !== "cockpit") return;
    let ips: string[] = [];
    try {
      ips = await invoke<string[]>("net_connections");
    } catch {
      return;
    }
    const dots: Dot[] = [];
    for (const ip of ips.slice(0, 20)) {
      if (!this.geoCache.has(ip)) {
        try {
          const r = await fetch(`https://ipwho.is/${ip}`);
          const j = await r.json();
          this.geoCache.set(
            ip,
            j && j.success !== false && typeof j.latitude === "number" && typeof j.longitude === "number"
              ? { lat: j.latitude, lon: j.longitude }
              : null,
          );
        } catch {
          // transient fetch failure: don't cache, retry next refresh instead
          // of permanently blanking this IP's dot
        }
      }
      const d = this.geoCache.get(ip);
      if (d) dots.push(d);
    }
    this.dots = dots;
  }

  private draw() {
    const c = this.canvas;
    c.width = c.clientWidth || 200;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2;
    const cy = c.height / 2;
    const R = Math.min(cx, cy) - 6;
    const style = getComputedStyle(document.body);
    const grid = style.getPropertyValue("--ck-border").trim() || "#123";
    const accent = style.getPropertyValue("--ck-accent").trim() || "#0af";

    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    const px = (p: { x: number; y: number }) => [cx + p.x * R, cy - p.y * R] as const;

    // continents: stroke each front-facing run of every coastline polyline
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (const line of COASTLINES) {
      for (const run of visibleRuns(line, this.rot)) {
        if (run.length < 2) continue;
        ctx.beginPath();
        const [x0, y0] = px(run[0]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < run.length; i++) {
          const [x, y] = px(run[i]);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    ctx.fillStyle = accent;
    for (const d of this.dots) {
      const p = projectLatLon(d.lat, d.lon, this.rot);
      if (!p.front) continue;
      const [x, y] = px(p);
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
