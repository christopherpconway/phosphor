import test from "node:test";
import assert from "node:assert/strict";
import { defaultCountdownTarget, parseCountdownTarget } from "../src/cockpit/widgets/timers.ts";

test("default countdown target is one hour ahead, to the minute, local time", () => {
  const now = new Date(2026, 7, 18, 17, 42, 31); // Aug 18 2026 17:42:31 local
  assert.equal(defaultCountdownTarget(now), "2026-08-18T18:42");
});

test("default target crosses midnight and month boundaries", () => {
  assert.equal(defaultCountdownTarget(new Date(2026, 7, 31, 23, 30, 0)), "2026-09-01T00:30");
});

test("default target round-trips through the picker parser", () => {
  const t = defaultCountdownTarget(new Date(2026, 0, 5, 9, 0, 0));
  assert.deepEqual(parseCountdownTarget(`${t.replace("T", " ")} STANDUP`), { target: t, label: "STANDUP" });
});
