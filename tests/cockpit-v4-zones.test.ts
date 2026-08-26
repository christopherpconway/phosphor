import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeWidgets, moveToZone, cycleZone, DEFAULT_LAYOUT, ZONES,
} from "../src/cockpit/widget.ts";

test("tabs is a real zone and spaces defaults into it", () => {
  assert.equal(ZONES.includes("tabs"), true);
  assert.deepEqual(DEFAULT_LAYOUT.zone.tabs, ["spaces"]);
  assert.equal(DEFAULT_LAYOUT.zone.top.includes("spaces"), false);
});

test("spaces cannot be moved out of tabs", () => {
  const moved = moveToZone(DEFAULT_LAYOUT, "spaces", "left", 0);
  assert.deepEqual(moved.zone.tabs, ["spaces"]);
  assert.equal(moved.zone.left.includes("spaces"), false);
  assert.equal(cycleZone(DEFAULT_LAYOUT, "spaces", 1), DEFAULT_LAYOUT);
});

test("no other widget may occupy tabs", () => {
  const moved = moveToZone(DEFAULT_LAYOUT, "globe", "tabs", 0);
  assert.equal(moved.zone.tabs.includes("globe"), false);
  assert.equal(moved, DEFAULT_LAYOUT);
});

test("cycleZone steps past the pinned zone rather than stalling", () => {
  // left -> tabs would be next, but tabs is pinned, so it must land on right
  const moved = cycleZone(DEFAULT_LAYOUT, "cpu", 1);
  assert.equal(moved.zone.right.at(-1), "cpu");
  assert.equal(moved.zone.tabs.includes("cpu"), false);
});

test("a stored config that misplaces spaces is corrected", () => {
  const l = sanitizeWidgets({
    zone: { top: ["spaces"], left: [], tabs: [], right: [], bottom: [] },
    enabled: {},
  });
  assert.deepEqual(l.zone.tabs, ["spaces"]);
  assert.equal(l.zone.top.includes("spaces"), false);
});

test("a stored config that squats in tabs is cleaned out", () => {
  const l = sanitizeWidgets({
    zone: { top: [], left: [], tabs: ["globe", "spaces"], right: [], bottom: [] },
    enabled: {},
  });
  assert.deepEqual(l.zone.tabs, ["spaces"]);
  assert.equal(l.zone.right.includes("globe"), true);
});
