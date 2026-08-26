import test from "node:test";
import assert from "node:assert/strict";
import { parseWindowParams, nextWindowLabel } from "../src/win.ts";

test("main window: no offset, no config", () => {
  assert.deepEqual(parseWindowParams(""), { win: "main", config: null, base: 0 });
  assert.deepEqual(parseWindowParams("?foo=1"), { win: "main", config: null, base: 0 });
});

test("secondary windows get a PTY id offset of 1e6 per index and their config name", () => {
  assert.deepEqual(parseWindowParams("?win=w2&config=night"), { win: "w2", config: "night", base: 2_000_000 });
  assert.deepEqual(parseWindowParams("?win=w7"), { win: "w7", config: null, base: 7_000_000 });
  assert.deepEqual(parseWindowParams("?win=bogus"), { win: "main", config: null, base: 0 });
});

test("window labels count up from a stored counter starting at 2", () => {
  assert.deepEqual(nextWindowLabel(null), { label: "w2", next: "3" });
  assert.deepEqual(nextWindowLabel("9"), { label: "w9", next: "10" });
  assert.deepEqual(nextWindowLabel("junk"), { label: "w2", next: "3" });
});
