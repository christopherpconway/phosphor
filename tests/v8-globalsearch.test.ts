import test from "node:test";
import assert from "node:assert/strict";
import { searchLines } from "../src/globalsearch.ts";

const lines = ["alpha", "Beta ERROR here", "gamma", "error again"];
const read = (i: number) => lines[i];

test("case-insensitive substring with line numbers", () => {
  const hits = searchLines(read, lines.length, "error", 10);
  assert.deepEqual(hits.map((h) => h.line), [1, 3]);
});

test("max caps the result count", () => {
  assert.equal(searchLines(read, lines.length, "a", 2).length, 2);
});

test("empty query returns nothing", () => {
  assert.equal(searchLines(read, lines.length, "", 10).length, 0);
});
