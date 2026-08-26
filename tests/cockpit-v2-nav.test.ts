import test from "node:test";
import assert from "node:assert/strict";
import { moveFocus } from "../src/cockpit/configscreen.ts";

test("moveFocus clamps at both ends", () => {
  assert.equal(moveFocus(5, 0, -1), 0);
  assert.equal(moveFocus(5, 4, 1), 4);
  assert.equal(moveFocus(5, 2, 1), 3);
  assert.equal(moveFocus(0, 0, 1), 0);
});
