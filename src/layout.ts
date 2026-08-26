// Pure split-tree model for tabs' pane layouts. Never mutates; every op
// returns a new tree. Rects are unit-square fractions.

export type PaneLeaf = { pane: number; cwd?: string; startCmd?: string; name?: string };
export type SplitNode = { split: "h" | "v"; ratio: number; a: LayoutNode; b: LayoutNode };
export type LayoutNode = PaneLeaf | SplitNode;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const isLeaf = (n: LayoutNode): n is PaneLeaf => "pane" in n;

export function splitPane(
  root: LayoutNode,
  paneId: number,
  dir: "h" | "v",
  newId: number,
): LayoutNode {
  if (isLeaf(root)) {
    if (root.pane !== paneId) return root;
    return { split: dir, ratio: 0.5, a: root, b: { pane: newId } };
  }
  return {
    ...root,
    a: splitPane(root.a, paneId, dir, newId),
    b: splitPane(root.b, paneId, dir, newId),
  };
}

export function closePane(root: LayoutNode, paneId: number): LayoutNode | null {
  if (isLeaf(root)) return root.pane === paneId ? null : root;
  const a = closePane(root.a, paneId);
  const b = closePane(root.b, paneId);
  if (a === null) return b;
  if (b === null) return a;
  return { ...root, a, b };
}

const clampRatio = (r: number) => Math.min(0.9, Math.max(0.1, r));

/** splitPath: "" = root, then "a"/"b" chars descending, e.g. "ab" */
export function setRatio(root: LayoutNode, splitPath: string, ratio: number): LayoutNode {
  if (isLeaf(root)) return root;
  if (splitPath === "") return { ...root, ratio: clampRatio(ratio) };
  const branch = splitPath[0] as "a" | "b";
  const rest = splitPath.slice(1);
  return {
    ...root,
    [branch]: setRatio(root[branch], rest, ratio),
  } as SplitNode;
}

function walkRects(
  n: LayoutNode,
  rect: Rect,
  path: string,
  panes: Map<number, Rect>,
  bars: { path: string; dir: "h" | "v"; rect: Rect }[],
) {
  if (isLeaf(n)) {
    panes.set(n.pane, rect);
    return;
  }
  const { ratio } = n;
  if (n.split === "h") {
    const aw = rect.w * ratio;
    bars.push({ path, dir: "h", rect: { x: rect.x + aw, y: rect.y, w: 0, h: rect.h } });
    walkRects(n.a, { ...rect, w: aw }, path + "a", panes, bars);
    walkRects(n.b, { x: rect.x + aw, y: rect.y, w: rect.w - aw, h: rect.h }, path + "b", panes, bars);
  } else {
    const ah = rect.h * ratio;
    bars.push({ path, dir: "v", rect: { x: rect.x, y: rect.y + ah, w: rect.w, h: 0 } });
    walkRects(n.a, { ...rect, h: ah }, path + "a", panes, bars);
    walkRects(n.b, { x: rect.x, y: rect.y + ah, w: rect.w, h: rect.h - ah }, path + "b", panes, bars);
  }
}

export function paneRects(root: LayoutNode): Map<number, Rect> {
  const panes = new Map<number, Rect>();
  walkRects(root, { x: 0, y: 0, w: 1, h: 1 }, "", panes, []);
  return panes;
}

export function splitBars(root: LayoutNode): { path: string; dir: "h" | "v"; rect: Rect }[] {
  const bars: { path: string; dir: "h" | "v"; rect: Rect }[] = [];
  walkRects(root, { x: 0, y: 0, w: 1, h: 1 }, "", new Map(), bars);
  return bars;
}

export function paneIds(root: LayoutNode): number[] {
  if (isLeaf(root)) return [root.pane];
  return [...paneIds(root.a), ...paneIds(root.b)];
}

export function findLeaf(root: LayoutNode, paneId: number): PaneLeaf | null {
  if (isLeaf(root)) return root.pane === paneId ? root : null;
  return findLeaf(root.a, paneId) ?? findLeaf(root.b, paneId);
}

export function updateLeaf(
  root: LayoutNode,
  paneId: number,
  patch: Partial<Omit<PaneLeaf, "pane">>,
): LayoutNode {
  if (isLeaf(root)) return root.pane === paneId ? { ...root, ...patch } : root;
  return { ...root, a: updateLeaf(root.a, paneId, patch), b: updateLeaf(root.b, paneId, patch) };
}

export function neighbor(
  root: LayoutNode,
  from: number,
  dir: "left" | "right" | "up" | "down",
): number | null {
  const rects = paneRects(root);
  const src = rects.get(from);
  if (!src) return null;
  const cx = src.x + src.w / 2;
  const cy = src.y + src.h / 2;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const [id, r] of rects) {
    if (id === from) continue;
    const rx = r.x + r.w / 2;
    const ry = r.y + r.h / 2;
    const ok =
      dir === "left" ? rx < cx :
      dir === "right" ? rx > cx :
      dir === "up" ? ry < cy : ry > cy;
    if (!ok) continue;
    const dist = (rx - cx) ** 2 + (ry - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}
