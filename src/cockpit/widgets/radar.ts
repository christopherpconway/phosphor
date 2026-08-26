// RADAR: rotating sweep over the machine's live outbound connections.
// Each remote IP hashes to a stable polar position; the sweep lights blips
// as it passes. Canvas repaints continuously; the one-CRT rasterizer
// drawImages it onto the tube.
import { invoke } from "@tauri-apps/api/core";
import { makePanel } from "../sysmon.ts";
import type { Widget } from "../widget.ts";

export const SWEEP_SECS = 5;
const POLL_MS = 10000;

/** Stable (angle, radius) for an IP: same contact, same spot on the scope. */
export function blipFor(ip: string): { angle: number; radius: number } {
  let h = 2166136261;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  return {
    angle: ((u % 3600) / 3600) * Math.PI * 2,
    radius: 0.25 + ((Math.floor(u / 3600) % 1000) / 1000) * 0.65,
  };
}

/** 0..1 brightness of a blip given the sweep angle: bright at the beam,
 *  fading as the beam moves on. */
export function blipGlow(blipAngle: number, sweepAngle: number): number {
  const behind = (sweepAngle - blipAngle + Math.PI * 2) % (Math.PI * 2);
  return Math.max(0.15, 1 - behind / (Math.PI * 1.2));
}

const accent = () =>
  getComputedStyle(document.body).getPropertyValue("--ck-accent").trim() || "#0af";

export function createRadar(): Widget {
  const panel = makePanel("RADAR");
  const canvas = document.createElement("canvas");
  canvas.className = "ck-globe";
  const count = document.createElement("div");
  count.className = "ck-fact-line";
  count.textContent = "CONTACTS 0";
  panel.body.append(canvas, count);
  const ctx = canvas.getContext("2d")!;

  let ips: string[] = [];

  const poll = () => {
    if (!panel.root.isConnected) return;
    invoke<string[]>("net_connections")
      .then((list) => {
        ips = list;
        count.textContent = `CONTACTS ${list.length}`;
      })
      .catch(() => {});
  };
  poll();
  setInterval(poll, POLL_MS);

  const draw = () => {
    requestAnimationFrame(draw);
    if (!panel.root.isConnected) return;
    const w = (canvas.width = canvas.clientWidth || 200);
    const h = (canvas.height = Math.round(w * 0.72));
    canvas.style.height = `${h}px`;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 4;
    if (r <= 0) return;
    const col = accent();
    ctx.clearRect(0, 0, w, h);

    // rings + crosshairs
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    for (const f of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    const sweep = ((performance.now() / 1000) % SWEEP_SECS) / SWEEP_SECS * Math.PI * 2;

    // trailing wedge behind the beam
    for (let i = 0; i < 10; i++) {
      ctx.globalAlpha = 0.05 * (1 - i / 10);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, sweep - (i + 1) * 0.06, sweep - i * 0.06);
      ctx.closePath();
      ctx.fill();
    }
    // the beam itself
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r);
    ctx.stroke();

    // contacts
    for (const ip of ips) {
      const b = blipFor(ip);
      const glow = blipGlow(b.angle, sweep);
      ctx.globalAlpha = glow;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(b.angle) * r * b.radius, cy + Math.sin(b.angle) * r * b.radius, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  draw();

  return { id: "radar", title: "RADAR", root: panel.root };
}
