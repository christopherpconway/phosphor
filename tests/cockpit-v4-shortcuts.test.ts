import test from "node:test";
import assert from "node:assert/strict";
import { SHORTCUTS } from "../src/shortcuts.ts";

test("every shortcut is fully described and uniquely identified", () => {
  const ids = new Set<string>();
  for (const s of SHORTCUTS) {
    assert.ok(s.label.length > 0, `${s.id} has no label`);
    assert.ok(s.mac.length > 0, `${s.id} has no chord`);
    assert.ok(s.group.length > 0, `${s.id} has no group`);
    assert.equal(typeof s.match, "function");
    assert.equal(ids.has(s.id), false, `duplicate id ${s.id}`);
    ids.add(s.id);
  }
  assert.ok(SHORTCUTS.length >= 10);
});

test("the help chord is itself in the table", () => {
  assert.ok(SHORTCUTS.some((s) => s.id === "help"));
});

test("globalsearch and undoclose are both in the table", () => {
  assert.ok(SHORTCUTS.some((s) => s.id === "globalsearch"));
  assert.ok(SHORTCUTS.some((s) => s.id === "undoclose"));
});
