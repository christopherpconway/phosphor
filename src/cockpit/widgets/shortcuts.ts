// SHORTCUTS widget: the live shortcut table, grouped. Reads src/shortcuts.ts
// so it can never disagree with what the keys actually do (PH-7).
import { SHORTCUTS, type Shortcut } from "../../shortcuts.ts";
import { makePanel } from "../sysmon.ts";
import type { Widget } from "../widget.ts";

export function shortcutGroups(list: readonly Shortcut[]): { group: string; rows: { label: string; mac: string }[] }[] {
  const out: { group: string; rows: { label: string; mac: string }[] }[] = [];
  for (const s of list) {
    let g = out.find((x) => x.group === s.group);
    if (!g) out.push((g = { group: s.group, rows: [] }));
    g.rows.push({ label: s.label, mac: s.mac });
  }
  return out;
}

export function createShortcutsWidget(): Widget {
  const panel = makePanel("SHORTCUTS");
  const table = document.createElement("div");
  table.className = "ck-shortcuts";
  for (const g of shortcutGroups(SHORTCUTS)) {
    const h = document.createElement("div");
    h.className = "ck-shortcuts-group";
    h.textContent = g.group.toUpperCase();
    table.append(h);
    for (const r of g.rows) {
      const row = document.createElement("div");
      row.className = "ck-shortcuts-row";
      const k = document.createElement("span");
      k.className = "ck-shortcuts-key";
      k.textContent = r.mac;
      const l = document.createElement("span");
      l.textContent = r.label;
      row.append(k, l);
      table.append(row);
    }
  }
  panel.body.append(table);
  return { id: "shortcuts", title: "SHORTCUTS", root: panel.root };
}
