import test from "node:test";
import assert from "node:assert/strict";
import { pushCapped } from "../src/cockpit/sysmon.ts";

test("pushCapped appends and drops from the front", () => {
  assert.deepEqual(pushCapped([1, 2], 3, 5), [1, 2, 3]);
  assert.deepEqual(pushCapped([1, 2, 3], 4, 3), [2, 3, 4]);
});

test("pushCapped does not mutate its input", () => {
  const a = [1, 2, 3];
  pushCapped(a, 4, 3);
  assert.deepEqual(a, [1, 2, 3]);
});
