import test from "node:test";
import assert from "node:assert/strict";
import { formatHMS, powerLabel } from "../src/cockpit/widgets/clock.ts";

test("formatHMS pads every field", () => {
  assert.equal(formatHMS(new Date(2026, 0, 2, 3, 4, 5)), "03:04:05");
  assert.equal(formatHMS(new Date(2026, 0, 2, 23, 59, 59)), "23:59:59");
});

test("powerLabel covers charge states", () => {
  // a desktop Mac has no battery line; that means AC, not unknown
  assert.equal(powerLabel(null), "AC");
  assert.equal(powerLabel({ percent: 87, charging: false }), "87%");
  assert.equal(powerLabel({ percent: 87, charging: true }), "87% CHG");
});
