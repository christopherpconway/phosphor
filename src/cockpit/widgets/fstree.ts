// Tree-view file browser. The defining rule: BROWSING the tree (arrows,
// clicks, expand/collapse) never moves the shell; only an explicit Enter
// acts (2026-08-31 ruling: Enter on a folder cds the shell there, Enter on
// a file opens it with its default app, Cmd+Enter inserts the path).
import { invoke } from "@tauri-apps/api/core";
import { makePanel } from "../sysmon.ts";
import { type FsEntry, sortEntries } from "../files.ts";
import type { Widget } from "../widget.ts";

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  expanded: boolean;
  /** null means "not loaded yet", distinct from an empty directory. */
  children: TreeNode[] | null;
}

export type TreeAction =
  | "insert" | "cd" | "open" | "expand" | "collapse" | "next" | "prev"
  | "up" | "none";

/** Enter acts on the selection (cd for folders, open for files); the chord
 *  inserts the path; Backspace re-roots one level up. */
export function treeAction(key: string, meta: boolean, isDir: boolean): TreeAction {
  if (key === "Enter") return meta ? "insert" : isDir ? "cd" : "open";
  if (key === "Backspace") return "up";
  if (key === "ArrowRight") return "expand";
  if (key === "ArrowLeft") return "collapse";
  if (key === "ArrowDown") return "next";
  if (key === "ArrowUp") return "prev";
  return "none";
}

const join = (parent: string, name: string) =>
  parent === "/" ? `/${name}` : `${parent}/${name}`;

export function makeRoot(path: string): TreeNode {
  const name = path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
  return { name: name || "/", path, isDir: true, expanded: false, children: null };
}

function mapNode(node: TreeNode, path: string, fn: (n: TreeNode) => TreeNode): TreeNode {
  if (node.path === path) return fn(node);
  if (!node.children) return node;
  let changed = false;
  const children = node.children.map((c) => {
    const next = mapNode(c, path, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

export function insertChildren(root: TreeNode, path: string, entries: FsEntry[]): TreeNode {
  return mapNode(root, path, (n) => ({
    ...n,
    children: sortEntries(entries)
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: join(n.path, e.name),
        isDir: e.isDir,
        expanded: false,
        children: null,
      })),
  }));
}

export function toggleExpanded(root: TreeNode, path: string): TreeNode {
  return mapNode(root, path, (n) => ({ ...n, expanded: !n.expanded }));
}

export function setExpanded(root: TreeNode, path: string, on: boolean): TreeNode {
  return mapNode(root, path, (n) => (n.expanded === on ? n : { ...n, expanded: on }));
}

/** Visible nodes only: a collapsed directory contributes itself and nothing else. */
export function flatten(root: TreeNode): Array<{ node: TreeNode; depth: number }> {
  const out: Array<{ node: TreeNode; depth: number }> = [];
  const walk = (n: TreeNode, depth: number) => {
    out.push({ node: n, depth });
    if (n.expanded && n.children) for (const c of n.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return out;
}

/** Expand every ancestor of `path`, collapsing nothing. */
export function revealPath(root: TreeNode, path: string): TreeNode {
  let next = root;
  if (!path.startsWith(root.path)) return root;
  const rest = path.slice(root.path.length).split("/").filter(Boolean);
  let cur = root.path;
  next = setExpanded(next, cur, true);
  for (const part of rest) {
    cur = join(cur, part);
    next = setExpanded(next, cur, true);
  }
  return next;
}

export interface FsTreeWidget extends Widget {
  setCwd(path: string): void;
}

export function createFsTree(deps: {
  insertPath(p: string): void;
  cdTo(p: string): void;
  openPath(p: string): void;
}): FsTreeWidget {
  const panel = makePanel("FILES");
  const pathEl = document.createElement("div");
  pathEl.className = "ck-line ck-path";
  pathEl.textContent = "waiting for shell cwd";
  const list = document.createElement("div");
  list.className = "ck-tree";
  list.tabIndex = 0;
  panel.body.append(pathEl, list);
  panel.setStale(true);

  let root: TreeNode | null = null;
  let selected = "";
  let generation = 0;

  const rows = () => (root ? flatten(root) : []);

  const load = async (path: string) => {
    const mine = ++generation;
    try {
      const raw = await invoke<FsEntry[]>("fs_list", { path });
      if (mine !== generation || !root) return;
      root = insertChildren(root, path, raw);
      panel.setStale(false);
    } catch {
      if (mine !== generation) return;
      panel.setStale(true);
    }
    render();
  };

  const expand = (node: TreeNode) => {
    if (!root || !node.isDir) return;
    root = setExpanded(root, node.path, true);
    if (node.children === null) void load(node.path);
    else render();
  };

  const collapse = (node: TreeNode) => {
    if (!root) return;
    root = setExpanded(root, node.path, false);
    render();
  };

  const move = (delta: 1 | -1) => {
    const flat = rows();
    const i = flat.findIndex((r) => r.node.path === selected);
    const next = Math.min(flat.length - 1, Math.max(0, (i === -1 ? 0 : i) + delta));
    selected = flat[next]?.node.path ?? selected;
    render();
  };

  /** Re-root the tree one level up; the old root stays visible as a child. */
  const goUp = () => {
    if (!root || root.path === "/") return;
    const parent = root.path.replace(/\/[^/]*$/, "") || "/";
    const oldPath = root.path;
    root = makeRoot(parent);
    selected = oldPath;
    void load(parent);
  };

  const onKey = (e: KeyboardEvent) => {
    const node = rows().find((r) => r.node.path === selected)?.node;
    const action = treeAction(e.key, e.metaKey, node?.isDir ?? false);
    if (action === "none") return;
    e.preventDefault();
    if (action === "next") return move(1);
    if (action === "prev") return move(-1);
    if (action === "up") return goUp();
    if (!node) return;
    if (action === "insert") deps.insertPath(node.path);
    else if (action === "cd") deps.cdTo(node.path);
    else if (action === "open") deps.openPath(node.path);
    else if (action === "expand") expand(node);
    else if (action === "collapse") collapse(node);
  };
  list.addEventListener("keydown", onKey);

  function render() {
    list.innerHTML = "";
    if (root && root.path !== "/") {
      const up = document.createElement("div");
      up.className = "ck-treerow ck-tree-up";
      const glyph = document.createElement("span");
      glyph.className = "ck-tree-glyph";
      glyph.textContent = "▴";
      const name = document.createElement("span");
      name.className = "ck-tree-name";
      name.textContent = "..";
      up.append(glyph, name);
      up.addEventListener("click", goUp);
      list.append(up);
    }
    for (const { node, depth } of rows()) {
      const row = document.createElement("div");
      row.className = "ck-treerow";
      row.classList.toggle("sel", node.path === selected);
      row.style.paddingLeft = `${depth * 12}px`;
      const glyph = document.createElement("span");
      glyph.className = "ck-tree-glyph";
      glyph.textContent = node.isDir ? (node.expanded ? "▾" : "▸") : "·";
      const name = document.createElement("span");
      name.className = "ck-tree-name";
      name.textContent = node.name;
      row.append(glyph, name);
      row.addEventListener("click", () => {
        selected = node.path;
        // Clicking browses. It never moves the shell.
        if (node.isDir) (node.expanded ? collapse : expand)(node);
        else render();
      });
      list.append(row);
    }
  }

  return {
    id: "files",
    title: "FILES",
    root: panel.root,
    setCwd(path: string) {
      pathEl.textContent = path.replace(/^\/Users\/[^/]+/, "~");
      if (!root || !path.startsWith(root.path)) {
        root = makeRoot(path);
        selected = path;
        void load(path);
        return;
      }
      // The shell moved on its own: reveal where it went, do not follow it back.
      root = revealPath(root, path);
      render();
    },
  };
}
