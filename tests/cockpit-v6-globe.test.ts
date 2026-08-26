import test from "node:test";
import assert from "node:assert/strict";
import { visibleRuns } from "../src/cockpit/globe.ts";
import { COASTLINES } from "../src/cockpit/coastlines.ts";

test("a polyline crossing the limb splits into front-facing runs", () => {
  // equator from lon -60 to +120 in 30° steps at rot 0: front is |lon| < 90
  const poly = [0, -60, 0, -30, 0, 0, 0, 30, 0, 60, 0, 90, 0, 120];
  const runs = visibleRuns(poly, 0);
  assert.equal(runs.length, 1);
  // -60..90; 120 behind. 90 is the mathematical limb (cos should be 0), but
  // JS's Math.cos(90deg-in-radians) is a tiny positive float (6.12e-17), not
  // exactly 0, so projectLatLon's `> 0` test classifies it front-facing.
  // Observed against the real, unchanged projectLatLon — not an assumption.
  assert.equal(runs[0].length, 6);
  const back = visibleRuns([0, 150, 0, 180, 0, -150], 0);
  assert.equal(back.length, 0);
});

test("coastline data is present, well-formed, and in range", () => {
  assert.ok(COASTLINES.length > 100, `only ${COASTLINES.length} polylines`);
  let points = 0;
  for (const p of COASTLINES) {
    assert.equal(p.length % 2, 0);
    for (let i = 0; i < p.length; i += 2) {
      assert.ok(p[i] >= -90 && p[i] <= 90, `lat ${p[i]}`);
      assert.ok(p[i + 1] >= -180 && p[i + 1] <= 180, `lon ${p[i + 1]}`);
    }
    points += p.length / 2;
  }
  assert.ok(points > 3000 && points < 20000, `${points} points`);
});
