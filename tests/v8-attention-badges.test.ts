import test from "node:test";
import assert from "node:assert/strict";
import { spaceAttention } from "../src/attention/store.ts";
import { sanitizeCockpit, SEGMENT_IDS } from "../src/cockpit/config.ts";

test("spaceAttention is true when any pane holds attention", () => {
  const states: Record<number, any> = {
    1: { state: "idle" }, 2: { state: "needs-input" },
  };
  assert.ok(spaceAttention([1, 2], (id) => states[id]));
  assert.ok(!spaceAttention([1], (id) => states[id]));
});

test("att is a legal bar segment and survives sanitize", () => {
  assert.ok((SEGMENT_IDS as readonly string[]).includes("att"));
  const cfg = sanitizeCockpit({ bar: [{ id: "att", on: false }] });
  assert.deepEqual(cfg.bar.find((b) => b.id === "att"), { id: "att", on: false });
});
