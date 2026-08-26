import test from "node:test";
import assert from "node:assert/strict";
import { moveItem } from "../src/workspace.ts";

test("moveItem moves forward and backward without mutating", () => {
  const a = ["a", "b", "c", "d"];
  assert.deepEqual(moveItem(a, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(a, 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(a, ["a", "b", "c", "d"]);
});

test("moveItem ignores no-ops and bad indices", () => {
  const a = ["a", "b"];
  assert.deepEqual(moveItem(a, 1, 1), ["a", "b"]);
  assert.deepEqual(moveItem(a, 5, 0), ["a", "b"]);
  assert.deepEqual(moveItem(a, 0, -1), ["a", "b"]);
});
