import test from "node:test";
import assert from "node:assert/strict";
import { formatUptimeDDHHMM, formatDate } from "../src/cockpit/stats.ts";

test("formatUptimeDDHHMM", () => {
  assert.equal(formatUptimeDDHHMM(0), "00:00:00");
  assert.equal(formatUptimeDDHHMM(61), "00:00:01");
  assert.equal(formatUptimeDDHHMM(86400 + 3600 * 2 + 60 * 5), "01:02:05");
  assert.equal(formatUptimeDDHHMM(86400 * 123), "123:00:00");
});

test("formatDate", () => {
  assert.equal(formatDate(new Date(2026, 7, 3)), "MON AUG 3");
  assert.equal(formatDate(new Date(2026, 0, 25)), "SUN JAN 25");
});
