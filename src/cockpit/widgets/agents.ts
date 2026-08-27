// AGENTS widget: which panes hold the crew's attention right now, click to jump.
import { makePanel } from "../sysmon.ts";
import type { AttentionState, PaneAttention } from "../../attention/store.ts";
import { isShell } from "../../attention/store.ts";
import type { Widget } from "../widget.ts";

export interface AttentionRow {
  paneId: number;
  space: string;
  name: string;
  state: AttentionState;
  message: string;
  since: number;
}

const STATE_ORDER: Record<AttentionState, number> = {
  "needs-input": 0,
  done: 1,
  running: 2,
  idle: 3,
};

const GLYPH: Partial<Record<AttentionState, string>> = {
  "needs-input": "!",
  done: "✓",
  running: "▸",
};

/** Drops undescribed panes and idle shells, then attention-first / newest-first. */
export function agentRows(
  all: PaneAttention[],
  describe: (paneId: number) => { space: string; name: string } | null,
): AttentionRow[] {
  const rows: AttentionRow[] = [];
  for (const p of all) {
    if (p.state === "idle" && isShell(p.fgProcess)) continue;
    const d = describe(p.paneId);
    if (!d) continue;
    rows.push({
      paneId: p.paneId, space: d.space, name: d.name,
      state: p.state, message: p.message, since: p.since,
    });
  }
  return rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.since - a.since);
}

export function createAgents(deps: {
  getRows(): AttentionRow[];
  jump(paneId: number): void;
}): Widget {
  const panel = makePanel("AGENTS");
  const list = document.createElement("div");
  list.className = "ck-agents";
  panel.body.append(list);

  function render() {
    list.innerHTML = "";
    const rows = deps.getRows();
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ck-line dim";
      empty.textContent = "no agents running";
      list.append(empty);
      return;
    }
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "ck-line ck-agent-row";
      const glyph = document.createElement("span");
      glyph.className = "ck-agent-glyph";
      glyph.textContent = GLYPH[r.state] ?? "";
      if (r.state === "needs-input") glyph.classList.add("accent");
      const text = document.createElement("span");
      text.textContent = `${r.space} / ${r.name}  ${r.message || r.name}`;
      row.append(glyph, text);
      row.addEventListener("click", () => deps.jump(r.paneId));
      list.append(row);
    }
  }
  render();

  return {
    id: "agents",
    title: "AGENTS",
    root: panel.root,
    onSecond: render,
  };
}
