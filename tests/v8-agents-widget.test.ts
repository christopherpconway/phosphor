import test from "node:test";
import assert from "node:assert/strict";
import { agentRows } from "../src/cockpit/widgets/agents.ts";

const P = (paneId: number, state: string, fgProcess: string, since = 0) =>
  ({ paneId, state, fgProcess, title: "", message: "", since }) as any;

test("idle shells are hidden; attention sorts first", () => {
  const rows = agentRows(
    [P(1, "idle", "zsh"), P(2, "running", "claude", 5), P(3, "needs-input", "codex", 1)],
    (id) => ({ space: "s", name: `p${id}` }),
  );
  assert.deepEqual(rows.map((r) => r.paneId), [3, 2]);
});

test("panes the window cannot describe are dropped", () => {
  const rows = agentRows([P(9, "running", "claude")], () => null);
  assert.equal(rows.length, 0);
});
