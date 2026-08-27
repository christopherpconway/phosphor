import test from "node:test";
import assert from "node:assert/strict";
import { compileTrigger, matchTrigger, matchChunk } from "../src/attention/triggers.ts";

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

test("matchChunk finds a hit on a trailing-newline-terminated line", () => {
  const t = compileTrigger("PASS", "") as any;
  assert.ok(matchChunk([t], "PASS\r\n"));
});

test("matchChunk finds a hit on an interior line, not just the last", () => {
  const t = compileTrigger("ERROR", "") as any;
  assert.ok(matchChunk([t], "some\nERROR here\nmore\n"));
});

test("matchChunk returns null for clean output", () => {
  const t = compileTrigger("ERROR", "") as any;
  assert.equal(matchChunk([t], "clean output\n"), null);
});
