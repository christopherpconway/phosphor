// Guard for the 2026-08-26 "widget text illegible" report. The mono shader
// (src/crt.ts SCREEN_FRAG) collapses every colour scheme's rendered pixels
// down to a single tint scaled by luma, so hue never carries contrast under
// a mono scheme (green/amber): only a real luma gap between foreground and
// background keeps text legible. This floors that gap for every scheme, not
// just the two mono ones, since a future non-mono scheme with a dark-on-dark
// pairing would fail identically in NEXTGEN mode (no shader to collapse hue,
// but no hue gap either if luma is also flat).
import test from "node:test";
import assert from "node:assert/strict";
import { COLOR_SCHEMES, SCHEME_IDS } from "../src/crt.ts";

function relativeLuma(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Matches SCREEN_FRAG's own luma weights (dot(col, vec3(0.299, 0.587, 0.114))).
const MIN_LUMA_DELTA = 0.3;

test("every scheme's foreground clears the background by a real luma margin", () => {
  for (const id of SCHEME_IDS) {
    const s = COLOR_SCHEMES[id];
    const delta = Math.abs(relativeLuma(s.foreground) - relativeLuma(s.background));
    assert.ok(
      delta >= MIN_LUMA_DELTA,
      `${id}: foreground/background luma delta ${delta.toFixed(3)} is below the ${MIN_LUMA_DELTA} floor (fg=${s.foreground} bg=${s.background})`,
    );
  }
});

test("every scheme's accent (cursor) also clears the background", () => {
  for (const id of SCHEME_IDS) {
    const s = COLOR_SCHEMES[id];
    const delta = Math.abs(relativeLuma(s.cursor) - relativeLuma(s.background));
    assert.ok(
      delta >= MIN_LUMA_DELTA,
      `${id}: cursor/background luma delta ${delta.toFixed(3)} is below the ${MIN_LUMA_DELTA} floor (cursor=${s.cursor} bg=${s.background})`,
    );
  }
});
