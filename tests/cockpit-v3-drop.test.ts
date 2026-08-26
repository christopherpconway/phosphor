import test from "node:test";
import assert from "node:assert/strict";
import { dropIndex } from "../src/cockpit/widget.ts";

test("dropIndex places before the first midpoint it precedes", () => {
  assert.equal(dropIndex([100, 300, 500], 50), 0);
  assert.equal(dropIndex([100, 300, 500], 200), 1);
  assert.equal(dropIndex([100, 300, 500], 400), 2);
  assert.equal(dropIndex([100, 300, 500], 900), 3);
  assert.equal(dropIndex([], 10), 0);
});
