import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LAYOUT, moveWithinZone, moveToZone, setEnabled, cycleZone,
} from "../src/cockpit/widget.ts";

test("moveWithinZone swaps and clamps immutably", () => {
  const m = moveWithinZone(DEFAULT_LAYOUT, "left", 0, 1);
  assert.deepEqual(m.zone.left.slice(0, 2), ["clockmini", "clock"]);
  assert.deepEqual(DEFAULT_LAYOUT.zone.left.slice(0, 2), ["clock", "clockmini"]);
  assert.equal(moveWithinZone(DEFAULT_LAYOUT, "left", 0, -1), DEFAULT_LAYOUT);
  const last = DEFAULT_LAYOUT.zone.left.length - 1;
  assert.equal(moveWithinZone(DEFAULT_LAYOUT, "left", last, 1), DEFAULT_LAYOUT);
});

test("moveToZone removes from old zone and inserts clamped", () => {
  const m = moveToZone(DEFAULT_LAYOUT, "globe", "left", 1);
  assert.deepEqual(m.zone.left.slice(0, 3), ["clock", "globe", "clockmini"]);
  assert.equal(m.zone.right.includes("globe"), false);
  const end = moveToZone(DEFAULT_LAYOUT, "cpu", "bottom", 99);
  assert.equal(end.zone.bottom.at(-1), "cpu");
});

test("setEnabled flips only the target", () => {
  const m = setEnabled(DEFAULT_LAYOUT, "files", false);
  assert.equal(m.enabled.files, false);
  assert.equal(m.enabled.globe, true);
});

test("cycleZone advances through ZONES order and wraps", () => {
  const m = cycleZone(DEFAULT_LAYOUT, "statusbar", 1); // bottom -> top (wrap)
  assert.equal(m.zone.top.at(-1), "statusbar");
  const back = cycleZone(DEFAULT_LAYOUT, "cpu", -1); // left -> top
  assert.equal(back.zone.top.at(-1), "cpu");
});
