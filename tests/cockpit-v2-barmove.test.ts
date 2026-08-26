import test from "node:test";
import assert from "node:assert/strict";
import { moveBarItem } from "../src/cockpit/configscreen.ts";
import { DEFAULT_BAR } from "../src/cockpit/config.ts";

test("moveBarItem swaps and clamps without mutating", () => {
  const orig = DEFAULT_BAR.map((b) => ({ ...b }));
  const moved = moveBarItem(orig, 1, -1);
  assert.equal(moved[0].id, "time");
  assert.equal(moved[1].id, "brand");
  assert.equal(orig[0].id, "brand");
  assert.deepEqual(moveBarItem(orig, 0, -1), orig);
  assert.deepEqual(moveBarItem(orig, orig.length - 1, 1), orig);
});
