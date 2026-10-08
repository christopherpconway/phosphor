import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANIM_FRAME_MS,
  FULL_FRAME_MS,
  persistDecay,
  planFrame,
  settleMs,
} from "../src/crt.ts";

// An idle glass: nothing dirty, no time effects, afterglow long settled.
const IDLE = {
  now: 10_000,
  dirty: false,
  lastShade: 9_000,
  lastUpload: 9_000,
  timeFx: false,
  degaussing: false,
  settleMs: 0,
};

test("idle glass with all effects off does no work", () => {
  assert.equal(planFrame(IDLE), "idle");
});

test("a dirty composite renders a full frame, capped near 60 fps", () => {
  assert.equal(planFrame({ ...IDLE, dirty: true }), "full");
  assert.equal(planFrame({ ...IDLE, dirty: true, lastShade: IDLE.now - 8 }), "idle");
  assert.equal(planFrame({ ...IDLE, dirty: true, lastShade: IDLE.now - FULL_FRAME_MS }), "full");
});

test("time-driven effects keep the shaders animating at ~30 fps, without recompositing", () => {
  const fx = { ...IDLE, timeFx: true };
  assert.equal(planFrame({ ...fx, lastShade: IDLE.now - 17 }), "idle");
  assert.equal(planFrame({ ...fx, lastShade: IDLE.now - 33.4 }), "shade");
  assert.ok(ANIM_FRAME_MS <= 1000 / 30 && ANIM_FRAME_MS > 1000 / 60);
});

test("afterglow keeps shading until it settles, then the glass goes idle", () => {
  const ms = settleMs(0.5);
  const fading = { ...IDLE, settleMs: ms, lastUpload: IDLE.now - ms / 2 };
  assert.equal(planFrame(fading), "shade");
  assert.equal(planFrame({ ...fading, lastUpload: IDLE.now - ms - 1 }), "idle");
});

test("degauss animates at full rate even with every effect off", () => {
  assert.equal(planFrame({ ...IDLE, degaussing: true, lastShade: IDLE.now - 16 }), "shade");
});

test("settle time is when the afterglow falls below one 8-bit step", () => {
  assert.equal(settleMs(0), 0);
  for (const p of [0.1, 0.5, 1]) {
    const d = persistDecay(p);
    const frames = settleMs(p) / (1000 / 60);
    assert.ok(Math.abs(d ** frames - 1 / 255) < 1e-9, `persistence ${p}`);
  }
  // the shipped max persistence must still settle within a few seconds
  assert.ok(settleMs(1) < 4000);
});
