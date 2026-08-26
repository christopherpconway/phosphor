import test from "node:test";
import assert from "node:assert/strict";
import { projectLatLon } from "../src/cockpit/globe.ts";

test("facing point projects to center front", () => {
  const p = projectLatLon(0, 30, 30);
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9 && p.front);
});

test("back hemisphere is flagged", () => {
  assert.equal(projectLatLon(0, 210, 30).front, false);
});

test("north pole is up regardless of rotation", () => {
  const p = projectLatLon(90, 0, 123);
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y - 1) < 1e-9);
});
