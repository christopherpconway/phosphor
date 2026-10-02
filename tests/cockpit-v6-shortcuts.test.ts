import test from "node:test";
import assert from "node:assert/strict";
import { SHORTCUTS, isMac, swallowsKeypress } from "../src/shortcuts.ts";

const key = (init: Partial<KeyboardEvent>) => ({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: "", ...init }) as KeyboardEvent;

test("switchspace matches the platform chord for digits 1-9 only", () => {
  const sc = SHORTCUTS.find((s) => s.id === "switchspace")!;
  const mod = isMac ? { metaKey: true } : { altKey: true };
  for (let d = 1; d <= 9; d++) assert.ok(sc.match(key({ ...mod, key: String(d) })), `digit ${d}`);
  assert.equal(sc.match(key({ ...mod, key: "0" })), false);
  assert.equal(sc.match(key({ key: "3" })), false);
});

test("close still matches plain Cmd+W and now rejects Cmd+Shift+W on mac", () => {
  if (!isMac) return;
  const sc = SHORTCUTS.find((s) => s.id === "close")!;
  assert.ok(sc.match(key({ metaKey: true, key: "w" })));
  assert.equal(sc.match(key({ metaKey: true, shiftKey: true, key: "w" })), false);
});

test("undoclose matches the platform chord and does not collide with close", () => {
  const sc = SHORTCUTS.find((s) => s.id === "undoclose")!;
  const chord = isMac
    ? { metaKey: true, shiftKey: true, key: "w" }
    : { ctrlKey: true, shiftKey: true, key: "u" };
  assert.ok(sc.match(key(chord)));
  const close = SHORTCUTS.find((s) => s.id === "close")!;
  assert.equal(close.match(key(chord)), false);
});

test("Shift+Enter's trailing keypress is swallowed so xterm never sends a submitting CR", () => {
  assert.ok(swallowsKeypress(key({ type: "keypress", key: "Enter", shiftKey: true })));
  assert.equal(swallowsKeypress(key({ type: "keypress", key: "Enter" })), false);
  assert.equal(swallowsKeypress(key({ type: "keypress", key: "a" })), false);
  assert.equal(swallowsKeypress(key({ type: "keyup", key: "Enter", shiftKey: true })), false);
});
