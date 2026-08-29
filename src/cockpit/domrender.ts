// One-CRT rasterizer: replays the live widget DOM (boxes, borders, text,
// embedded canvases) into the CRT compositor so the whole window rides
// through the one screen shader — bend, scanlines, persistence, glow.
// The DOM itself stays in layout (opacity 0) for hit-testing, exactly like
// the xterm panes.
//
// ponytail: generic replay of computed styles, not a browser. Straight
// rects (panel corner notches ignored), first-line-rect text placement
// (widgets are nowrap throughout), no hover styles.

const NO_INK = new Set(["rgba(0, 0, 0, 0)", "transparent", ""]);
const hasInk = (c: string) => !NO_INK.has(c);

export class DomLayer {
  private layer = document.createElement("canvas");
  private lctx = this.layer.getContext("2d")!;
  private dirty = true;
  private lastRaster = 0;
  private observer = new MutationObserver(() => {
    this.dirty = true;
  });

  constructor(private zones: () => HTMLElement[]) {}

  observe(root: HTMLElement) {
    this.observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  }

  markDirty() {
    this.dirty = true;
  }

  /** Blit the widget layer; re-rasterize on DOM change or every 120ms —
   *  sparkline/globe/radar canvases repaint without any DOM mutation, and
   *  the radar sweep needs a reasonably fresh copy to read as motion. */
  draw(
    ctx: CanvasRenderingContext2D,
    canvasRect: DOMRect,
    dpr: number,
    w: number,
    h: number,
    now: number,
  ) {
    if (this.layer.width !== w || this.layer.height !== h) {
      this.layer.width = w;
      this.layer.height = h;
      this.dirty = true;
    }
    if (this.dirty || now - this.lastRaster > 120) {
      this.dirty = false;
      this.lastRaster = now;
      this.lctx.clearRect(0, 0, w, h);
      for (const zone of this.zones()) {
        // Zone roots carry the opacity:0 that hides the DOM; start at their
        // children so that never zeroes the replay.
        for (const child of zone.children) {
          this.drawNode(child as HTMLElement, canvasRect, dpr, 1);
        }
      }
    }
    ctx.drawImage(this.layer, 0, 0);
  }

  private drawNode(el: HTMLElement, cr: DOMRect, dpr: number, alpha: number) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    alpha *= Number(cs.opacity) || 1;
    if (alpha <= 0.01) return;

    // display:contents generates no box of its own — bg/border/clip never
    // apply to it, and getBoundingClientRect() always comes back zeroed —
    // but its children still lay out and still need replaying. Falling
    // through to the box-only code below would stop here and silently drop
    // the whole subtree (this is how SHORTCUTS rows, the one place that
    // grid-participates via display:contents, went missing under one-CRT).
    if (cs.display === "contents") {
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          this.drawText(node as Text, cs, cr, dpr, alpha);
        } else if (node instanceof HTMLElement) {
          this.drawNode(node, cr, dpr, alpha);
        }
      }
      return;
    }

    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const ctx = this.lctx;
    const x = (r.x - cr.x) * dpr;
    const y = (r.y - cr.y) * dpr;
    const w = r.width * dpr;
    const h = r.height * dpr;

    ctx.globalAlpha = alpha;

    if (el instanceof HTMLCanvasElement) {
      if (el.width > 0) ctx.drawImage(el, x, y, w, h);
      ctx.globalAlpha = 1;
      return;
    }

    const bg = cs.backgroundColor;
    if (hasInk(bg)) {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
    }
    // Per-side borders (headers use bottom-only). Uniform 1px lines cover
    // every widget style in the catalog.
    const side = (bw: string, color: string, sx: number, sy: number, sw: number, sh: number) => {
      const px = parseFloat(bw);
      if (px > 0 && hasInk(color)) {
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, sw, sh);
      }
    };
    side(cs.borderTopWidth, cs.borderTopColor, x, y, w, Math.max(1, parseFloat(cs.borderTopWidth) * dpr));
    side(cs.borderBottomWidth, cs.borderBottomColor, x, y + h - Math.max(1, parseFloat(cs.borderBottomWidth) * dpr), w, Math.max(1, parseFloat(cs.borderBottomWidth) * dpr));
    side(cs.borderLeftWidth, cs.borderLeftColor, x, y, Math.max(1, parseFloat(cs.borderLeftWidth) * dpr), h);
    side(cs.borderRightWidth, cs.borderRightColor, x + w - Math.max(1, parseFloat(cs.borderRightWidth) * dpr), y, Math.max(1, parseFloat(cs.borderRightWidth) * dpr), h);

    // Scroll containers clip their overflow; without this, scrolled-out file
    // rows would paint across neighbouring widgets.
    const clips = cs.overflowY === "auto" || cs.overflowY === "scroll" || cs.overflow === "hidden" || cs.overflowX === "hidden";
    if (clips) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
    }

    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        this.drawText(node as Text, cs, cr, dpr, alpha);
      } else if (node instanceof HTMLElement) {
        this.drawNode(node, cr, dpr, alpha);
      }
    }

    if (clips) ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawText(node: Text, cs: CSSStyleDeclaration, cr: DOMRect, dpr: number, alpha: number) {
    const text = node.textContent ?? "";
    if (!text.trim()) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getClientRects()[0];
    if (!rect || rect.width <= 0) return;
    const ctx = this.lctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = cs.color;
    ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * dpr}px ${cs.fontFamily}`;
    try {
      // letterSpacing on 2D contexts is newer than our floor; ignore if absent
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
        cs.letterSpacing === "normal" ? "0px" : `${parseFloat(cs.letterSpacing) * dpr}px`;
    } catch {}
    ctx.textBaseline = "middle";
    ctx.fillText(text.trim(), (rect.x - cr.x) * dpr, (rect.y + rect.height / 2 - cr.y) * dpr + 1);
    ctx.globalAlpha = 1;
  }
}
