import test from "node:test";
import assert from "node:assert/strict";
import { formatBytes, formatRate, formatUptime } from "../src/cockpit/stats.ts";

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
  assert.equal(formatBytes(2.5 * 1024 ** 3), "2.5 GB");
});

test("formatRate divides by tick seconds", () => {
  assert.equal(formatRate(2 * 1024 * 2, 2), "2.0 KB/s");
});

test("formatUptime", () => {
  assert.equal(formatUptime(59), "0m");
  assert.equal(formatUptime(3600 * 5 + 60 * 7), "5h 7m");
  assert.equal(formatUptime(86400 * 2 + 3600 * 3), "2d 3h");
});
