// WebGL post-processing over the (hidden) xterm canvas layers:
// composite all panes' layers + in-glass chrome -> phosphor persistence
// (ping-pong) -> CRT screen shader.

import type { Rect } from "./layout.ts";

export interface PaneSource {
  el: HTMLElement; // pane's DOM element; its live bounding rect is the draw position
  focused: boolean;
  /** Scrollback position, read fresh each frame for the in-glass ghost. */
  scrollInfo?: () => { show: boolean; frac: number; thumb: number };
}

export interface BarSource {
  dir: "h" | "v";
  rect: Rect;
}

export const STATUS_H = 22; // css px reserved at the bottom of the glass

// ---- in-glass tab column ----

export interface TabInfo {
  title: string;
  active: boolean;
  activity: boolean;
  attention: boolean;
}

export interface TabHit {
  kind: "tab" | "close" | "plus";
  index: number;
}

const TAB_X = 18; // css px from glass left
const TAB_W = 175;
const TAB_H = 40;
const TAB_GAP = 10;
const TAB_Y0 = 18;
const TAB_FONT = 16; // css px

interface CssRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tab row + plus-button rects in client css coords (same space pane els live in). */
export function tabColumnRects(
  canvasRect: DOMRect,
  count: number,
): { rows: CssRect[]; plus: CssRect } {
  const rows: CssRect[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      x: canvasRect.x + TAB_X,
      y: canvasRect.y + TAB_Y0 + i * (TAB_H + TAB_GAP),
      w: TAB_W,
      h: TAB_H,
    });
  }
  return {
    rows,
    plus: {
      x: canvasRect.x + TAB_X,
      y: canvasRect.y + TAB_Y0 + count * (TAB_H + TAB_GAP),
      w: TAB_W,
      h: TAB_H - 4,
    },
  };
}

export function tabHitAt(
  canvasRect: DOMRect,
  count: number,
  p: { x: number; y: number },
): TabHit | null {
  const { rows, plus } = tabColumnRects(canvasRect, count);
  const inside = (r: CssRect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  for (let i = 0; i < rows.length; i++) {
    if (inside(rows[i])) {
      return { kind: p.x > rows[i].x + rows[i].w - 26 ? "close" : "tab", index: i };
    }
  }
  if (inside(plus)) return { kind: "plus", index: -1 };
  return null;
}

export interface CrtSettings {
  scanlines: number;
  curvature: number;
  glow: number;
  flicker: number;
  persistence: number;
  jitter: number;
  noise: number;
  mono: boolean;
  tint: [number, number, number];
}


// ---------- v4: two independent axes ----------
// A colour scheme decides palette only; a render mode decides effects only.
// Before v4 these were one "preset", which is why selecting the Tron look
// forced CRT effects on and the sliders could not turn them off.

export type EffectKey =
  | "scanlines" | "curvature" | "glow" | "flicker" | "persistence" | "jitter" | "noise";

export const EFFECT_KEYS: readonly EffectKey[] = [
  "scanlines", "curvature", "glow", "flicker", "persistence", "jitter", "noise",
];

export type Effects = Record<EffectKey, number>;

/** The shipped green preset's effect values: the project's tuned baseline. */
export const RETRO_DEFAULTS: Effects = {
  scanlines: 0.6, curvature: 0.45, glow: 0.55, flicker: 0.25,
  persistence: 0.5, jitter: 0.3, noise: 0.25,
};

export const NEXTGEN_EFFECTS: Effects = {
  scanlines: 0, curvature: 0, glow: 0, flicker: 0,
  persistence: 0, jitter: 0, noise: 0,
};

/** The 16 ANSI slots xterm themes accept; what makes Dracula read as Dracula. */
export interface AnsiPalette {
  black: string; red: string; green: string; yellow: string;
  blue: string; magenta: string; cyan: string; white: string;
  brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string;
  brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string;
}

export interface ColorScheme {
  foreground: string;
  background: string;
  cursor: string;
  tint: [number, number, number];
  /** Monochrome is a property of the palette, not of the effect stack. */
  mono: boolean;
  /** Optional full ANSI palette; schemes without one keep xterm defaults. */
  ansi?: AnsiPalette;
}

export type SchemeId =
  | "green" | "amber" | "modern" | "tron"
  | "dracula" | "nord" | "gruvbox" | "solarized" | "catppuccin" | "gotham";

export const SCHEME_IDS: readonly SchemeId[] = [
  "green", "amber", "modern", "tron",
  "dracula", "nord", "gruvbox", "solarized", "catppuccin", "gotham",
];

export const COLOR_SCHEMES: Record<SchemeId, ColorScheme> = {
  green: {
    foreground: "#7dffa0", background: "#041006", cursor: "#7dffa0",
    tint: [0.35, 1.0, 0.5], mono: true,
  },
  amber: {
    foreground: "#ffc266", background: "#120b02", cursor: "#ffc266",
    tint: [1.0, 0.72, 0.28], mono: true,
  },
  modern: {
    foreground: "#e6edf3", background: "#0a0d10", cursor: "#e6edf3",
    tint: [0.9, 0.95, 1.0], mono: false,
  },
  tron: {
    foreground: "#9fd8ff", background: "#030a12", cursor: "#33bbff",
    tint: [0.45, 0.8, 1.0], mono: false,
  },
  dracula: {
    foreground: "#f8f8f2", background: "#282a36", cursor: "#bd93f9",
    tint: [0.74, 0.58, 0.98], mono: false,
    ansi: {
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94",
      brightYellow: "#ffffa5", brightBlue: "#d6acff", brightMagenta: "#ff92df",
      brightCyan: "#a4ffff", brightWhite: "#ffffff",
    },
  },
  nord: {
    foreground: "#d8dee9", background: "#2e3440", cursor: "#88c0d0",
    tint: [0.53, 0.75, 0.82], mono: false,
    ansi: {
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b", brightBlue: "#81a1c1", brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb", brightWhite: "#eceff4",
    },
  },
  gruvbox: {
    foreground: "#ebdbb2", background: "#282828", cursor: "#fe8019",
    tint: [1.0, 0.63, 0.33], mono: false,
    ansi: {
      black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921",
      blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#a89984",
      brightBlack: "#928374", brightRed: "#fb4934", brightGreen: "#b8bb26",
      brightYellow: "#fabd2f", brightBlue: "#83a598", brightMagenta: "#d3869b",
      brightCyan: "#8ec07c", brightWhite: "#ebdbb2",
    },
  },
  solarized: {
    foreground: "#839496", background: "#002b36", cursor: "#93a1a1",
    tint: [0.15, 0.55, 0.82], mono: false,
    ansi: {
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#586e75",
      brightYellow: "#657b83", brightBlue: "#839496", brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
    },
  },
  catppuccin: {
    foreground: "#cdd6f4", background: "#1e1e2e", cursor: "#f5e0dc",
    tint: [0.8, 0.65, 0.97], mono: false,
    ansi: {
      black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
      blue: "#89b4fa", magenta: "#f5c2e7", cyan: "#94e2d5", white: "#bac2de",
      brightBlack: "#585b70", brightRed: "#f38ba8", brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af", brightBlue: "#89b4fa", brightMagenta: "#f5c2e7",
      brightCyan: "#94e2d5", brightWhite: "#a6adc8",
    },
  },
  gotham: {
    foreground: "#99d1ce", background: "#0c1014", cursor: "#26a98b",
    tint: [0.15, 0.66, 0.55], mono: false,
    ansi: {
      black: "#0c1014", red: "#c23127", green: "#2aa889", yellow: "#edb443",
      blue: "#195466", magenta: "#4e5166", cyan: "#33859e", white: "#98d1ce",
      brightBlack: "#10151b", brightRed: "#d26937", brightGreen: "#245361",
      brightYellow: "#599cab", brightBlue: "#888ca6", brightMagenta: "#4e5166",
      brightCyan: "#093748", brightWhite: "#d3ebe9",
    },
  },
};

export const FONTS: Record<string, string> = {
  ibm3270: '"IBM 3270", monospace',
  ibmvga: '"IBM VGA", monospace',
  apple2: '"Apple II", monospace',
  wargames: '"WarGames Terminal", monospace',
  ioskeley: '"Ioskeley Mono", monospace',
  system: "Menlo, monospace",
};

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const PERSIST_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uDecay;
void main() {
  vec3 c = texture2D(uCur, vUv).rgb;
  vec3 p = texture2D(uPrev, vUv).rgb * uDecay;
  gl_FragColor = vec4(max(c, p), 1.0);
}`;

const SCREEN_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uTexRes;
uniform float uTime;
uniform float uScan;
uniform float uCurv;
uniform float uGlow;
uniform float uFlicker;
uniform float uJitter;
uniform float uNoise;
uniform float uMono;
uniform vec3 uTint;
uniform float uDegauss;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 curve(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  float r2 = dot(uv, uv);
  uv *= 1.0 + r2 * uCurv * 0.11;
  return uv * 0.5 + 0.5;
}

void main() {
  vec2 suv = curve(vUv); // physical screen coordinate (mask uses this)
  // inset content so barrel distortion never pushes edge columns off-screen
  float margin = uCurv * 0.02 + 0.006;
  vec2 cuv = (suv - margin) / (1.0 - 2.0 * margin);

  float jit = (hash(vec2(floor(cuv.y * uTexRes.y), floor(uTime * 47.0))) - 0.5)
              * uJitter * 0.0035;
  cuv.x += jit;

  // degauss: a decaying magnetic wobble + colour separation + brightness kick
  float dg = uDegauss * uDegauss;
  cuv.x += sin(cuv.y * 14.0 + uTime * 42.0) * dg * 0.02;
  cuv.y += sin(cuv.x * 11.0 - uTime * 33.0) * dg * 0.012;

  float ab = uCurv * 0.0012 + 0.0003 + dg * 0.006;
  vec3 col;
  col.r = texture2D(uTex, cuv + vec2(ab, 0.0)).r;
  col.g = texture2D(uTex, cuv).g;
  col.b = texture2D(uTex, cuv - vec2(ab, 0.0)).b;

  vec2 px = 1.0 / uTexRes;
  vec3 bloom = vec3(0.0);
  bloom += texture2D(uTex, cuv + vec2(px.x * 1.5, 0.0)).rgb;
  bloom += texture2D(uTex, cuv - vec2(px.x * 1.5, 0.0)).rgb;
  bloom += texture2D(uTex, cuv + vec2(0.0, px.y * 1.5)).rgb;
  bloom += texture2D(uTex, cuv - vec2(0.0, px.y * 1.5)).rgb;
  bloom += texture2D(uTex, cuv + px * 2.5).rgb;
  bloom += texture2D(uTex, cuv - px * 2.5).rgb;
  bloom += texture2D(uTex, cuv + vec2(px.x, -px.y) * 2.5).rgb;
  bloom += texture2D(uTex, cuv + vec2(-px.x, px.y) * 2.5).rgb;
  // black outside the content rect (CLAMP_TO_EDGE would smear edge glyphs)
  float inb = step(0.0, cuv.x) * step(cuv.x, 1.0) * step(0.0, cuv.y) * step(cuv.y, 1.0);
  col *= inb;
  col += bloom * 0.125 * uGlow * 1.7 * inb;

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, uTint * luma * 1.15, uMono);

  float scan = 0.5 + 0.5 * sin(cuv.y * uTexRes.y * 3.14159);
  col *= mix(1.0, 0.62 + 0.38 * scan, uScan);
  float slot = 0.5 + 0.5 * sin(gl_FragCoord.x * 3.14159 * 0.666);
  col *= mix(1.0, 0.88 + 0.12 * slot, uScan);

  col *= 1.0
       - uFlicker * 0.06 * (0.5 + 0.5 * sin(uTime * 117.0))
       - uFlicker * 0.04 * hash(vec2(uTime, 1.0));
  col *= 1.0 + dg * 0.7;
  col += (hash(vUv * uRes.xy + fract(uTime) * 100.0) - 0.5) * uNoise * 0.10;

  vec2 v = vUv * 2.0 - 1.0;
  col *= 1.0 - dot(v, v) * 0.16;

  vec2 edge = smoothstep(vec2(-0.002), vec2(0.006), suv)
            * (1.0 - smoothstep(vec2(0.994), vec2(1.002), suv));
  float mask = edge.x * edge.y;
  col *= mask;
  col += uTint * 0.028 * mask * (0.4 + uMono * 0.6);

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vert));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
  }
  return p;
}

function makeTex(gl: WebGLRenderingContext): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export class CrtRenderer {
  settings: CrtSettings;
  private canvas: HTMLCanvasElement;
  private gl!: WebGLRenderingContext;
  private comp = document.createElement("canvas");
  private ctx2d = this.comp.getContext("2d")!;
  private screenProg!: WebGLProgram;
  private persistProg!: WebGLProgram;
  private srcTex!: WebGLTexture;
  private pingTex: WebGLTexture[] = [];
  private pingFbo: WebGLFramebuffer[] = [];
  private ping = 0;
  private texW = 0;
  private texH = 0;
  private raf = 0;
  private sources: PaneSource[] = [];
  private bars: BarSource[] = [];
  private statusText = "";
  private bg = "#000";
  private contentEl: HTMLElement | null = null;
  private tabs: TabInfo[] = [];
  private chromeFn:
    | ((ctx: CanvasRenderingContext2D, canvasRect: DOMRect, dpr: number, w: number, h: number, now: number) => void)
    | null = null;
  private degaussT0 = -1e9;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.settings = { ...RETRO_DEFAULTS, mono: COLOR_SCHEMES.green.mono, tint: COLOR_SCHEMES.green.tint };
  }

  /** The container whose box is the pane content area (status row sits below it). */
  setContentEl(el: HTMLElement) {
    this.contentEl = el;
  }

  setSources(sources: PaneSource[], bars: BarSource[], statusText: string) {
    this.sources = sources;
    this.bars = bars;
    this.statusText = statusText;
  }

  setTabs(tabs: TabInfo[]) {
    this.tabs = tabs;
  }

  setBackground(color: string) {
    this.bg = color;
  }

  /** Extra compositor pass drawn under the panes (one-CRT widget layer). */
  setChrome(fn: typeof this.chromeFn) {
    this.chromeFn = fn;
  }

  /** Kick off the degauss wobble (scheme/mode switches). */
  degauss() {
    this.degaussT0 = performance.now();
  }

  private tintCss(alpha: number): string {
    const [r, g, b] = this.settings.tint;
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`;
  }

  start(): boolean {
    const gl = this.canvas.getContext("webgl", {
      alpha: false,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) return false;
    this.gl = gl;
    this.screenProg = compile(gl, VERT, SCREEN_FRAG);
    this.persistProg = compile(gl, VERT, PERSIST_FRAG);
    this.srcTex = makeTex(gl);
    for (let i = 0; i < 2; i++) {
      this.pingTex.push(makeTex(gl));
      this.pingFbo.push(gl.createFramebuffer()!);
    }
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    for (const prog of [this.screenProg, this.persistProg]) {
      const loc = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
    return true;
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private resizeTargets(w: number, h: number) {
    const gl = this.gl;
    this.texW = w;
    this.texH = h;
    this.comp.width = w;
    this.comp.height = h;
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.pingTex[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pingFbo[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pingTex[i], 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private frame() {
    const gl = this.gl;
    if (this.sources.length === 0) return;

    const dprC = window.devicePixelRatio || 1;
    const w = Math.floor(this.canvas.clientWidth * dprC);
    const h = Math.floor(this.canvas.clientHeight * dprC);
    if (w === 0 || h === 0) return;
    if (w !== this.texW || h !== this.texH) this.resizeTargets(w, h);

    const ctx = this.ctx2d;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);

    const canvasRect = this.canvas.getBoundingClientRect();
    this.chromeFn?.(ctx, canvasRect, dprC, w, h, performance.now());
    const contRect = (this.contentEl ?? this.canvas).getBoundingClientRect();
    const ox = (contRect.x - canvasRect.x) * dprC;
    const oy = (contRect.y - canvasRect.y) * dprC;
    const cw2 = contRect.width * dprC;
    const ch2 = contRect.height * dprC;

    for (const src of this.sources) {
      const r = src.el.getBoundingClientRect();
      const px = Math.round((r.x - canvasRect.x) * dprC);
      const py = Math.round((r.y - canvasRect.y) * dprC);
      const layers = src.el.querySelectorAll<HTMLCanvasElement>(".xterm-screen canvas");
      // xterm layer canvases can outsize their pane (cell rounding, stale
      // fits), and the canvas addon paints an opaque background across the
      // whole surface — unclipped, that spill blankets the widget zones on
      // the full-window comp. Confine each pane to its own box.
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, Math.round(r.width * dprC), Math.round(r.height * dprC));
      ctx.clip();
      layers.forEach((c) => {
        if (c.width > 0) ctx.drawImage(c, px, py);
      });
      ctx.restore();

      // scrollback ghost: thin track + thumb on the pane's right edge,
      // only while scrolled up into history
      const sc = src.scrollInfo?.();
      if (sc?.show) {
        const pw = r.width * dprC;
        const ph = r.height * dprC;
        const tx = px + pw - 4 * dprC;
        ctx.fillStyle = this.tintCss(0.15);
        ctx.fillRect(tx, py, 2 * dprC, ph);
        const th = Math.max(18 * dprC, sc.thumb * ph);
        ctx.fillStyle = this.tintCss(0.7);
        ctx.fillRect(tx, py + sc.frac * (ph - th), 2 * dprC, th);
      }
      if (src.focused && this.sources.length > 1) {
        ctx.strokeStyle = this.tintCss(0.45);
        ctx.lineWidth = 2;
        ctx.strokeRect(px - 2, py - 2, r.width * dprC + 4, r.height * dprC + 4);
      }
    }

    ctx.strokeStyle = this.tintCss(0.3);
    ctx.lineWidth = Math.max(1, dprC);
    for (const bar of this.bars) {
      ctx.beginPath();
      if (bar.dir === "h") {
        const bx = Math.round(ox + bar.rect.x * cw2) + 0.5;
        ctx.moveTo(bx, oy + bar.rect.y * ch2);
        ctx.lineTo(bx, oy + (bar.rect.y + bar.rect.h) * ch2);
      } else {
        const by = Math.round(oy + bar.rect.y * ch2) + 0.5;
        ctx.moveTo(ox + bar.rect.x * cw2, by);
        ctx.lineTo(ox + (bar.rect.x + bar.rect.w) * cw2, by);
      }
      ctx.stroke();
    }

    if (this.tabs.length > 0) {
      const { rows, plus } = tabColumnRects(canvasRect, this.tabs.length);
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(TAB_FONT * dprC)}px "IBM VGA", monospace`;
      this.tabs.forEach((tab, i) => {
        const r = rows[i];
        const x = (r.x - canvasRect.x) * dprC;
        const y = (r.y - canvasRect.y) * dprC;
        const w = r.w * dprC;
        const h = r.h * dprC;
        if (tab.active) {
          ctx.fillStyle = "#d8d8d2"; // inverse video block: mono shader makes it bright phosphor
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#0a0a0a";
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = this.tintCss(0.3);
          ctx.lineWidth = Math.max(1, dprC);
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
          ctx.fillStyle = this.tintCss(0.85);
        }
        const dot = tab.attention && !tab.active ? "● " : tab.activity && !tab.active ? "○ " : "";
        let title = dot + tab.title;
        while (title.length > 3 && ctx.measureText(title).width > w - 34 * dprC) {
          title = title.slice(0, -1);
        }
        ctx.fillText(title, x + 8 * dprC, y + h / 2 + 1);
        ctx.globalAlpha = 0.55;
        ctx.fillText("x", x + w - 18 * dprC, y + h / 2 + 1);
        ctx.globalAlpha = 1;
      });
      const px2 = (plus.x - canvasRect.x) * dprC;
      const py2 = (plus.y - canvasRect.y) * dprC;
      const pw2 = plus.w * dprC;
      const ph2 = plus.h * dprC;
      ctx.strokeStyle = this.tintCss(0.35);
      ctx.lineWidth = Math.max(1, dprC);
      ctx.strokeRect(px2 + 0.5, py2 + 0.5, pw2 - 1, ph2 - 1);
      ctx.fillStyle = this.tintCss(0.85);
      ctx.fillText("+", px2 + pw2 / 2 - 4 * dprC, py2 + ph2 / 2 + 1);
    }

    if (this.statusText) {
      const statusH = STATUS_H * dprC;
      ctx.fillStyle = this.tintCss(0.04);
      ctx.fillRect(ox, oy + ch2, cw2, statusH);
      ctx.strokeStyle = this.tintCss(0.25);
      ctx.lineWidth = Math.max(1, dprC);
      ctx.beginPath();
      ctx.moveTo(ox, oy + ch2 + 0.5);
      ctx.lineTo(ox + cw2, oy + ch2 + 0.5);
      ctx.stroke();
      ctx.fillStyle = this.tintCss(0.9);
      ctx.font = `${Math.round(13 * dprC)}px "IBM VGA", monospace`;
      ctx.textBaseline = "middle";
      ctx.fillText(this.statusText, ox + Math.round(8 * dprC), oy + ch2 + statusH / 2 + 1);
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.comp);

    const s = this.settings;
    const decay = s.persistence > 0 ? 0.55 + s.persistence * 0.42 : 0.0;

    // NextGen is the zero case of this same pipeline, not a second pipeline.
    // The persistence pass is deliberately NOT skipped when every effect is 0:
    // srcTex is uploaded flipped, and rendering it to the ping framebuffer
    // flips it again, so pointing the screen pass at srcTex to save one blit
    // renders the terminal upside down. With decay 0 this pass is already a
    // plain copy; the blit is not worth a mirrored screen.
    const dst = this.ping;
    const src = 1 - this.ping;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pingFbo[dst]);
    gl.viewport(0, 0, this.texW, this.texH);
    gl.useProgram(this.persistProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.pingTex[src]);
    gl.uniform1i(gl.getUniformLocation(this.persistProg, "uCur"), 0);
    gl.uniform1i(gl.getUniformLocation(this.persistProg, "uPrev"), 1);
    gl.uniform1f(gl.getUniformLocation(this.persistProg, "uDecay"), decay);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.ping = src;

    // screen pass
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.floor(this.canvas.clientWidth * dpr);
    const ch = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.useProgram(this.screenProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pingTex[dst]);
    const u = (n: string) => gl.getUniformLocation(this.screenProg, n);
    gl.uniform1i(u("uTex"), 0);
    gl.uniform2f(u("uRes"), cw, ch);
    gl.uniform2f(u("uTexRes"), this.texW, this.texH);
    gl.uniform1f(u("uTime"), performance.now() / 1000);
    gl.uniform1f(u("uScan"), s.scanlines);
    gl.uniform1f(u("uCurv"), s.curvature);
    gl.uniform1f(u("uGlow"), s.glow);
    gl.uniform1f(u("uFlicker"), s.flicker);
    gl.uniform1f(u("uJitter"), s.jitter);
    gl.uniform1f(u("uNoise"), s.noise);
    gl.uniform1f(u("uMono"), s.mono ? 1 : 0);
    gl.uniform3f(u("uTint"), s.tint[0], s.tint[1], s.tint[2]);
    const dgAge = (performance.now() - this.degaussT0) / 700;
    gl.uniform1f(u("uDegauss"), dgAge >= 1 ? 0 : Math.max(0, 1 - dgAge));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
