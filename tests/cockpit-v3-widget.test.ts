import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeWidgets, DEFAULT_LAYOUT } from "../src/cockpit/widget.ts";
import { sanitizeCockpit } from "../src/cockpit/config.ts";

test("garbage yields default layout", () => {
  assert.deepEqual(sanitizeWidgets(null), DEFAULT_LAYOUT);
  assert.deepEqual(sanitizeWidgets({ zone: "nope" }), DEFAULT_LAYOUT);
});

test("unknown and duplicate ids dropped, missing appended to default zone", () => {
  const l = sanitizeWidgets({
    zone: { top: ["globe", "bogus"], left: ["globe"], right: [], bottom: [] },
    enabled: { globe: false, bogus: true },
  });
  // statusbar defaults to the top zone since the 2026-08-31 punch list
  assert.deepEqual(l.zone.top, ["globe", "statusbar"]);
  assert.deepEqual(l.zone.tabs, ["spaces"]);
  assert.deepEqual(l.zone.left, ["clock", "clockmini", "hwinfo", "cpu", "memory", "disk", "tokens", "timer", "stopwatch", "countdown", "procs", "snippets"]);
  assert.deepEqual(l.zone.right, ["agents", "netstatus", "radar", "traffic"]);
  assert.deepEqual(l.zone.bottom, ["files", "keyboard", "logtail", "shortcuts"]);
  assert.equal(l.enabled.globe, false);
  assert.equal(l.enabled.cpu, true);
  assert.equal("bogus" in l.enabled, false);
});

test("ck sanitizer carries widgets", () => {
  const c = sanitizeCockpit(null);
  assert.deepEqual(c.widgets, DEFAULT_LAYOUT);
});

test("sanitizeCockpit result never aliases DEFAULT_LAYOUT", () => {
  const c = sanitizeCockpit(null);
  assert.notEqual(c.widgets, DEFAULT_LAYOUT);
  const before = [...DEFAULT_LAYOUT.zone.left];
  c.widgets.zone.left.push("statusbar" as any);
  assert.deepEqual(DEFAULT_LAYOUT.zone.left, before);
});
