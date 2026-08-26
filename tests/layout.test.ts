import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closePane,
  neighbor,
  paneIds,
  paneRects,
  setRatio,
  splitBars,
  splitPane,
  type LayoutNode,
} from "../src/layout.ts";

const leaf = (pane: number): LayoutNode => ({ pane });

test("splitPane replaces the leaf with a split holding old and new", () => {
  const root = splitPane(leaf(1), 1, "h", 2);
  assert.deepEqual(root, { split: "h", ratio: 0.5, a: { pane: 1 }, b: { pane: 2 } });
});

test("splitPane leaves other panes untouched and does not mutate", () => {
  const base = splitPane(leaf(1), 1, "h", 2);
  const next = splitPane(base, 2, "v", 3);
  assert.deepEqual(base, { split: "h", ratio: 0.5, a: { pane: 1 }, b: { pane: 2 } });
  assert.deepEqual(paneIds(next).sort(), [1, 2, 3]);
});

test("closePane collapses to the sibling", () => {
  const root = splitPane(leaf(1), 1, "h", 2);
  assert.deepEqual(closePane(root, 1), { pane: 2 });
});

test("closePane of the last pane returns null", () => {
  assert.equal(closePane(leaf(7), 7), null);
});

test("setRatio clamps to 0.1..0.9", () => {
  const root = splitPane(leaf(1), 1, "h", 2);
  const r = setRatio(root, "", 0.02) as { ratio: number };
  assert.equal(r.ratio, 0.1);
  const r2 = setRatio(root, "", 0.99) as { ratio: number };
  assert.equal(r2.ratio, 0.9);
});

test("paneRects tile the unit square", () => {
  let root = splitPane(leaf(1), 1, "h", 2);
  root = splitPane(root, 2, "v", 3);
  const rects = [...paneRects(root).values()];
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - 1) < 1e-9);
  const r1 = paneRects(root).get(1)!;
  assert.deepEqual(r1, { x: 0, y: 0, w: 0.5, h: 1 });
});

test("splitBars reports one bar per split", () => {
  let root = splitPane(leaf(1), 1, "h", 2);
  root = splitPane(root, 2, "v", 3);
  const bars = splitBars(root);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].dir, "h");
});

test("serialize round-trip", () => {
  let root = splitPane(leaf(1), 1, "h", 2);
  root = splitPane(root, 2, "v", 3);
  assert.deepEqual(JSON.parse(JSON.stringify(root)), root);
});

test("neighbor moves spatially and returns null at edges", () => {
  let root = splitPane(leaf(1), 1, "h", 2); // 1 left, 2 right
  root = splitPane(root, 2, "v", 3); // 2 top-right, 3 bottom-right
  assert.equal(neighbor(root, 1, "right"), 2);
  assert.equal(neighbor(root, 3, "up"), 2);
  assert.equal(neighbor(root, 2, "left"), 1);
  assert.equal(neighbor(root, 1, "left"), null);
});
