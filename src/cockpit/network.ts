import { formatRate, TICK_SECS, type Stats } from "./stats.ts";
import { makePanel, pushCapped } from "./sysmon.ts";

const HISTORY = 60;

export class NetworkPanel {
  root: HTMLElement;
  private panel = makePanel("NETWORK");
  private label = document.createElement("div");
  private canvas = document.createElement("canvas");
  private rxHist: number[] = [];
  private txHist: number[] = [];

  constructor() {
    this.root = this.panel.root;
    this.label.className = "ck-line";
    this.canvas.className = "ck-spark";
    this.canvas.height = 56;
    this.panel.body.append(this.label, this.canvas);
  }

  setStale(on: boolean) {
    this.panel.setStale(on);
  }

  update(s: Stats) {
    const rx = s.nets.reduce((a, n) => a + n.rx, 0);
    const tx = s.nets.reduce((a, n) => a + n.tx, 0);
    this.rxHist = pushCapped(this.rxHist, rx, HISTORY);
    this.txHist = pushCapped(this.txHist, tx, HISTORY);
    const names = s.nets.map((n) => n.name).slice(0, 3).join(" ") || "idle";
    this.label.textContent = `${names}  ↓${formatRate(rx, TICK_SECS)} ↑${formatRate(tx, TICK_SECS)}`;
    this.draw();
  }

  private draw() {
    const c = this.canvas;
    c.width = c.clientWidth || 200;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    const max = Math.max(1024, ...this.rxHist, ...this.txHist);
    const style = getComputedStyle(document.body);
    const draw = (hist: number[], color: string) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      hist.forEach((v, i) => {
        const x = (i / (HISTORY - 1)) * c.width;
        const y = c.height - (v / max) * (c.height - 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    draw(this.rxHist, style.getPropertyValue("--ck-accent") || "#0af");
    draw(this.txHist, style.getPropertyValue("--ck-warn") || "#f80");
  }
}
