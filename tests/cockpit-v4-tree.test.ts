import test from "node:test";
import assert from "node:assert/strict";
import {
  makeRoot, insertChildren, toggleExpanded, flatten, revealPath, treeAction,
} from "../src/cockpit/widgets/fstree.ts";

const entries = [
  { name: "src", isDir: true, size: 0 },
  { name: "a.txt", isDir: false, size: 1 },
  { name: ".hidden", isDir: false, size: 1 },
];

test("a fresh root is collapsed and unloaded", () => {
  const r = makeRoot("/x");
  assert.equal(r.children, null);
  assert.equal(r.expanded, false);
  assert.equal(flatten(r).length, 1);
});

test("children insert under the matching path, dirs first, dotfiles hidden", () => {
  const r = insertChildren(makeRoot("/x"), "/x", entries);
  assert.deepEqual(r.children!.map((c) => c.name), ["src", "a.txt"]);
  assert.equal(r.children![0].path, "/x/src");
});

test("root path does not double its slash", () => {
  const r = insertChildren(makeRoot("/"), "/", [{ name: "etc", isDir: true, size: 0 }]);
  assert.equal(r.children![0].path, "/etc");
});

test("collapsed directories hide their descendants", () => {
  let r = insertChildren(makeRoot("/x"), "/x", entries);
  r = toggleExpanded(r, "/x");
  assert.equal(flatten(r).length, 3);
  r = insertChildren(r, "/x/src", [{ name: "deep.ts", isDir: false, size: 1 }]);
  assert.equal(flatten(r).length, 3);
  r = toggleExpanded(r, "/x/src");
  // depth-first: the nested child sits between src and its sibling
  assert.deepEqual(flatten(r).map((x) => x.node.name), ["x", "src", "deep.ts", "a.txt"]);
  assert.deepEqual(flatten(r).map((x) => x.depth), [0, 1, 2, 1]);
});

test("toggling is immutable", () => {
  const r = insertChildren(makeRoot("/x"), "/x", entries);
  const t = toggleExpanded(r, "/x");
  assert.equal(r.expanded, false);
  assert.equal(t.expanded, true);
});

test("revealPath expands every ancestor and nothing else", () => {
  let r = insertChildren(makeRoot("/x"), "/x", entries);
  r = insertChildren(r, "/x/src", [{ name: "deep.ts", isDir: false, size: 1 }]);
  r = revealPath(r, "/x/src/deep.ts");
  assert.equal(r.expanded, true);
  const src = r.children!.find((c) => c.name === "src")!;
  assert.equal(src.expanded, true);
  const other = r.children!.find((c) => c.name === "a.txt")!;
  assert.equal(other.expanded, false);
});

test("revealPath ignores a path outside the tree", () => {
  const r = insertChildren(makeRoot("/x"), "/x", entries);
  assert.equal(revealPath(r, "/elsewhere/deep"), r);
});

test("Enter acts on the selection; the chord inserts (2026-08-31 ruling)", () => {
  assert.equal(treeAction("Enter", false, true), "cd");
  assert.equal(treeAction("Enter", false, false), "open");
  assert.equal(treeAction("Enter", true, true), "insert");
  assert.equal(treeAction("Enter", true, false), "insert");
  assert.equal(treeAction("Backspace", false, false), "up");
  assert.equal(treeAction("ArrowRight", false, true), "expand");
  assert.equal(treeAction("ArrowLeft", false, true), "collapse");
  assert.equal(treeAction("ArrowDown", false, false), "next");
  assert.equal(treeAction("ArrowUp", false, false), "prev");
  assert.equal(treeAction("x", false, false), "none");
});
