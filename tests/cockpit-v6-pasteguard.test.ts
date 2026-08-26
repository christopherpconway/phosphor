import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCockpit, DEFAULT_COCKPIT } from "../src/cockpit/config.ts";

test("paste guard defaults off and survives sanitize", () => {
  assert.equal(DEFAULT_COCKPIT.pasteGuard, false);
  assert.equal(sanitizeCockpit(null).pasteGuard, false);
  // an explicit boolean is honoured either way; a non-boolean falls back to the default
  assert.equal(sanitizeCockpit({ pasteGuard: true }).pasteGuard, true);
  assert.equal(sanitizeCockpit({ pasteGuard: false }).pasteGuard, false);
  assert.equal(sanitizeCockpit({ pasteGuard: "no" }).pasteGuard, false);
});
