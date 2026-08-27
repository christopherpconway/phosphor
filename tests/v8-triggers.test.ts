import test from "node:test";
import assert from "node:assert/strict";
import { compileTrigger, matchTrigger } from "../src/attention/triggers.ts";

test("plain text compiles to a substring match", () => {
  const t = compileTrigger("tests passed", "");
  assert.ok(typeof t !== "string");
  assert.ok(matchTrigger([t as any], "32 tests passed today"));
});

test("regex metachars work as regex", () => {
  const t = compileTrigger("error|ERROR", "err");
  assert.ok(typeof t !== "string");
  assert.ok(matchTrigger([t as any], "ERROR: boom"));
  assert.equal(matchTrigger([t as any], "all fine"), null);
});

test("invalid regex returns the error string", () => {
  const t = compileTrigger("(", "");
  assert.equal(typeof t, "string");
});

test("label defaults to the pattern", () => {
  const t = compileTrigger("done", "") as any;
  assert.equal(t.label, "done");
});
