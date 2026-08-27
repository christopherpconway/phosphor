// SNIPPETS widget: the pinned ten at a glance, type to search the full
// library, Enter/click inserts at the focused pane. Same filter-and-list
// idiom as the command palette, scaled down to a panel body.
import { makePanel } from "../sysmon.ts";
import { pinnedInOrder, searchSnippets, type Snippet } from "../../snippets.ts";
import { plainTextInput } from "../../textinput.ts";
import type { Widget } from "../widget.ts";

const MAX_EMPTY_ROWS = 10;

export function createSnippets(deps: {
  getSnippets(): Snippet[];
  insertSnippet(code: string): void;
  openSnippetLib(): void;
}): Widget {
  const panel = makePanel("SNIPPETS");
  const input = document.createElement("input");
  plainTextInput(input);
  input.className = "ck-snip-filter";
  input.placeholder = "filter…";
  const list = document.createElement("div");
  list.className = "ck-tree";
  panel.body.append(input, list);

  let selected = "";

  /** Empty query: pinned ten. Otherwise the ranked pinned/unpinned split. */
  const sections = (): { pinned: Snippet[]; unpinned: Snippet[] } => {
    const q = input.value.trim();
    if (!q) return { pinned: pinnedInOrder(deps.getSnippets()).slice(0, MAX_EMPTY_ROWS), unpinned: [] };
    return searchSnippets(deps.getSnippets(), q);
  };

  const rows = (): Snippet[] => {
    const { pinned, unpinned } = sections();
    return [...pinned, ...unpinned];
  };

  const move = (delta: 1 | -1) => {
    const items = rows();
    const i = items.findIndex((s) => s.id === selected);
    const next = Math.min(items.length - 1, Math.max(0, (i === -1 ? 0 : i) + delta));
    selected = items[next]?.id ?? selected;
    render();
  };

  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = rows().find((r) => r.id === selected);
      if (s) deps.insertSnippet(s.code);
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.value = "";
      selected = "";
      render();
    }
  });

  function render(): void {
    const q = input.value.trim();
    const { pinned, unpinned } = sections();
    const items = [...pinned, ...unpinned];
    if (!items.some((s) => s.id === selected)) selected = items[0]?.id ?? "";

    list.innerHTML = "";

    const addRow = (s: Snippet) => {
      const row = document.createElement("div");
      row.className = "ck-snip-row" + (s.id === selected ? " sel" : "");
      const name = document.createElement("span");
      name.className = "ck-snip-name";
      name.textContent = s.name;
      const code = document.createElement("span");
      code.className = "ck-snip-code";
      code.textContent = s.code.split("\n")[0];
      row.append(name, code);
      row.addEventListener("click", () => {
        selected = s.id;
        deps.insertSnippet(s.code);
      });
      list.append(row);
    };

    for (const s of pinned) addRow(s);
    if (q && unpinned.length > 0) {
      const divider = document.createElement("div");
      divider.className = "ck-snip-divider";
      divider.textContent = "-- library --";
      list.append(divider);
    }
    for (const s of unpinned) addRow(s);

    const open = document.createElement("div");
    open.className = "ck-line dim ck-snip-open";
    open.textContent = "open library…";
    open.addEventListener("click", () => deps.openSnippetLib());
    list.append(open);
  }
  render();

  return {
    id: "snippets",
    title: "SNIPPETS",
    root: panel.root,
    onSecond: render,
  };
}
