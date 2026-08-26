import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeSidebars, zoneVisible } from "../src/cockpit/config.ts";

test("sidebars sanitizes to a known value", () => {
  assert.equal(sanitizeSidebars("left"), "left");
  assert.equal(sanitizeSidebars("none"), "none");
  assert.equal(sanitizeSidebars("nope"), "both");
  assert.equal(sanitizeSidebars(undefined), "both");
});

test("zoneVisible gates only the side columns", () => {
  assert.equal(zoneVisible("left", "right"), false);
  assert.equal(zoneVisible("right", "right"), true);
  assert.equal(zoneVisible("left", "left"), true);
  assert.equal(zoneVisible("right", "left"), false);
  assert.equal(zoneVisible("left", "none"), false);
  assert.equal(zoneVisible("right", "none"), false);
  assert.equal(zoneVisible("left", "both"), true);
  for (const s of ["both", "left", "right", "none"] as const) {
    assert.equal(zoneVisible("top", s), true);
    assert.equal(zoneVisible("tabs", s), true);
    assert.equal(zoneVisible("bottom", s), true);
  }
});
