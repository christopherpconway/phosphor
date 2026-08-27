import test from "node:test";
import assert from "node:assert/strict";
import { searchLines } from "../src/globalsearch.ts";

const lines = ["alpha", "Beta ERROR here", "gamma", "error again"];
const read = (i: number) => lines[i];

test("case-insensitive substring with line numbers", () => {
  const { hits, stopped } = searchLines(read, lines.length, "error", 10);
  assert.deepEqual(hits.map((h) => h.line), [1, 3]);
  assert.equal(stopped, false);
});

test("max caps the result count and reports stopped", () => {
  const { hits, stopped } = searchLines(read, lines.length, "a", 2);
  assert.equal(hits.length, 2);
  assert.equal(stopped, true);
});

test("hitting max exactly at the last line is not stopped", () => {
  const twoLines = ["error", "error"];
  const { hits, stopped } = searchLines((i) => twoLines[i], twoLines.length, "error", 2);
  assert.equal(hits.length, 2);
  assert.equal(stopped, false);
});

test("empty query returns nothing", () => {
  const { hits } = searchLines(read, lines.length, "", 10);
  assert.equal(hits.length, 0);
});
