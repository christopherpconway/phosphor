import { test } from "node:test";
import assert from "node:assert/strict";
import { curveUv, inverseCurveUv, screenToContent } from "../src/distortion.ts";

const CURVS = [0, 0.25, 0.45, 1];
const GRID = [0.05, 0.25, 0.5, 0.75, 0.95];

test("center is a fixed point", () => {
  for (const c of CURVS) {
    const [u, v] = screenToContent(0.5, 0.5, c);
    assert.ok(Math.abs(u - 0.5) < 1e-6 && Math.abs(v - 0.5) < 1e-6);
  }
});

test("inverseCurveUv inverts curveUv across the screen", () => {
  for (const c of CURVS) {
    for (const x of GRID) {
      for (const y of GRID) {
        const [cu, cv] = curveUv(x, y, c);
        const [iu, iv] = inverseCurveUv(cu, cv, c);
        assert.ok(Math.abs(iu - x) < 1e-4 && Math.abs(iv - y) < 1e-4, `c=${c} p=(${x},${y})`);
      }
    }
  }
});

test("zero curvature still applies the base margin only", () => {
  const [u] = screenToContent(0.006, 0.5, 0);
  assert.ok(Math.abs(u) < 1e-6); // margin edge maps to content 0
});
