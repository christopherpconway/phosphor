import test from "node:test";
import assert from "node:assert/strict";
import { isValidConfigName, sanitizeStore, configNames, withConfig, withoutConfig } from "../src/configs.ts";

test("config names are trimmed 1..32 chars", () => {
  assert.equal(isValidConfigName("Work"), true);
  assert.equal(isValidConfigName("  "), false);
  assert.equal(isValidConfigName("x".repeat(33)), false);
});

test("store round-trips, rejects junk, sorts names case-insensitively", () => {
  assert.deepEqual(sanitizeStore(null), {});
  assert.deepEqual(sanitizeStore("nope"), {});
  const s = sanitizeStore({ zeta: { a: 1 }, "": { bad: true }, Alpha: { b: 2 } });
  assert.deepEqual(configNames(s), ["Alpha", "zeta"]);
});

test("withConfig / withoutConfig are immutable and validate the name", () => {
  const s0 = {};
  const s1 = withConfig(s0, " Night ", { mode: "cockpit" });
  assert.deepEqual(s0, {});
  assert.deepEqual(configNames(s1), ["Night"]);
  assert.equal(withConfig(s1, "", {}), s1);
  const s2 = withoutConfig(s1, "Night");
  assert.deepEqual(s2, {});
  assert.deepEqual(configNames(s1), ["Night"]);
});
