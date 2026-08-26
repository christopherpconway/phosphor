import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCockpit, DEFAULT_BAR, SEGMENT_IDS } from "../src/cockpit/config.ts";

test("new fields default", () => {
  const c = sanitizeCockpit(null);
  assert.equal(c.brand, "");
  assert.deepEqual(c.bar, DEFAULT_BAR);
});

test("bar sanitize drops unknown ids and dupes, appends missing", () => {
  const c = sanitizeCockpit({
    bar: [
      { id: "wan", on: false },
      { id: "nope", on: true },
      { id: "wan", on: true },
      { id: "time", on: false },
    ],
  });
  assert.deepEqual(c.bar[0], { id: "wan", on: false });
  assert.deepEqual(c.bar[1], { id: "time", on: false });
  const ids = c.bar.map((b) => b.id);
  assert.deepEqual([...ids].sort(), [...SEGMENT_IDS].sort());
  assert.equal(ids.length, SEGMENT_IDS.length);
});

test("brand accepts strings only and trims to 24 chars", () => {
  assert.equal(sanitizeCockpit({ brand: "WOPR" }).brand, "WOPR");
  assert.equal(sanitizeCockpit({ brand: 42 }).brand, "");
  assert.equal(sanitizeCockpit({ brand: "x".repeat(40) }).brand.length, 24);
});

test("v1 fields still sanitize", () => {
  const c = sanitizeCockpit({ boot: false, sounds: false, sidebars: "left", cursorBlink: false });
  assert.equal(c.sidebars, "left");
  assert.equal(c.cursorBlink, false);
});
