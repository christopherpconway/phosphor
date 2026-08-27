import test from "node:test";
import assert from "node:assert/strict";
import {
  PIN_CAP, sanitizeSnippets, searchSnippets, togglePin, withSnippet,
} from "../src/snippets.ts";

const S = (name: string, code: string, pinned = false, order = 0) =>
  ({ id: name, name, code, pinned, order, created: "2026-08-27" });

test("sanitize drops junk and keeps valid entries", () => {
  const got = sanitizeSnippets([S("a", "ls"), { name: 1 }, null, S("b", "pwd", true)]);
  assert.equal(got.length, 2);
  assert.equal(got[1].pinned, true);
});

test("pin cap refuses the 11th pin", () => {
  let list = Array.from({ length: 10 }, (_, i) => S(`p${i}`, "x", true, i));
  list = withSnippet(list, S("extra", "y"));
  assert.equal(togglePin(list, "extra"), "cap");
});

test("search: name matches rank above code-only matches", () => {
  const list = [S("deploy", "git push", true, 0), S("logs", "kubectl deploy tail", true, 1)];
  const r = searchSnippets(list, "deploy");
  assert.deepEqual(r.pinned.map((s) => s.name), ["deploy", "logs"]);
});

test("search covers unpinned below pinned; empty query is the pinned list", () => {
  const list = [S("a", "ls", true, 0), S("b", "ls -la", false, 1)];
  const r = searchSnippets(list, "ls");
  assert.deepEqual(r.pinned.map((s) => s.name), ["a"]);
  assert.deepEqual(r.unpinned.map((s) => s.name), ["b"]);
  const empty = searchSnippets(list, "");
  assert.deepEqual(empty.pinned.map((s) => s.name), ["a"]);
  assert.equal(empty.unpinned.length, 0);
});
