import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCockpit } from "../src/cockpit/config.ts";

test("attention defaults: on, tray on, badges on, sound OFF", () => {
  const d = sanitizeCockpit(null).attention;
  assert.deepEqual(d, { enabled: true, tray: true, badges: true, sound: false });
});

test("attention config round-trips and rejects junk", () => {
  const c = sanitizeCockpit({ attention: { enabled: false, sound: true, tray: "x" } }).attention;
  assert.deepEqual(c, { enabled: false, tray: true, badges: true, sound: true });
});
