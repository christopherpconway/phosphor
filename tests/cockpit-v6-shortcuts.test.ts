import test from "node:test";
import assert from "node:assert/strict";
import { SHORTCUTS, isMac } from "../src/shortcuts.ts";

const key = (init: Partial<KeyboardEvent>) => ({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: "", ...init }) as KeyboardEvent;

test("switchspace matches the platform chord for digits 1-9 only", () => {
  const sc = SHORTCUTS.find((s) => s.id === "switchspace")!;
  const mod = isMac ? { metaKey: true } : { altKey: true };
  for (let d = 1; d <= 9; d++) assert.ok(sc.match(key({ ...mod, key: String(d) })), `digit ${d}`);
  assert.equal(sc.match(key({ ...mod, key: "0" })), false);
  assert.equal(sc.match(key({ key: "3" })), false);
});
