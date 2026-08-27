import test from "node:test";
import assert from "node:assert/strict";
import { createAttentionStore, isShell } from "../src/attention/store.ts";

const mk = (focused: number[] = []) =>
  createAttentionStore({ isFocused: (id) => focused.includes(id) });

test("fg shell means idle, non-shell means running", () => {
  const s = mk();
  s.apply({ kind: "fg", paneId: 1, process: "-zsh" }, 1000);
  assert.equal(s.get(1)!.state, "idle");
  s.apply({ kind: "fg", paneId: 1, process: "claude" }, 2000);
  assert.equal(s.get(1)!.state, "running");
  assert.equal(s.get(1)!.fgProcess, "claude");
});

test("bell and osc9 set needs-input on an unfocused pane, with message", () => {
  const s = mk();
  s.apply({ kind: "fg", paneId: 1, process: "claude" }, 1000);
  s.apply({ kind: "bell", paneId: 1 }, 2000);
  assert.equal(s.get(1)!.state, "needs-input");
  s.apply({ kind: "osc9", paneId: 1, text: "tests done" }, 3000);
  assert.equal(s.get(1)!.message, "tests done");
});

test("bell on the focused pane is ignored", () => {
  const s = mk([1]);
  s.apply({ kind: "fg", paneId: 1, process: "claude" }, 1000);
  s.apply({ kind: "bell", paneId: 1 }, 2000);
  assert.equal(s.get(1)!.state, "running");
});

test("cmd-done while unfocused sets done; focus clears back", () => {
  const s = mk();
  s.apply({ kind: "fg", paneId: 1, process: "cargo" }, 1000);
  s.apply({ kind: "cmd-done", paneId: 1 }, 2000);
  assert.equal(s.get(1)!.state, "done");
  s.apply({ kind: "focus", paneId: 1 }, 3000);
  assert.equal(s.get(1)!.state, "running");
  s.apply({ kind: "fg", paneId: 1, process: "zsh" }, 4000);
  assert.equal(s.get(1)!.state, "idle");
});

test("focus clears needs-input and message", () => {
  const s = mk();
  s.apply({ kind: "trigger", paneId: 2, label: "ERROR seen" }, 1000);
  assert.equal(s.get(2)!.state, "needs-input");
  assert.equal(s.get(2)!.message, "ERROR seen");
  s.apply({ kind: "focus", paneId: 2 }, 2000);
  assert.equal(s.get(2)!.message, "");
});

test("claude refinement overrides generic state", () => {
  const s = mk();
  s.apply({ kind: "fg", paneId: 1, process: "claude" }, 1000);
  s.apply({ kind: "claude", paneId: 1, state: "needs-input" }, 2000);
  assert.equal(s.get(1)!.state, "needs-input");
});

test("closed removes the pane; attentionCount counts attention states", () => {
  const s = mk();
  s.apply({ kind: "trigger", paneId: 1, label: "x" }, 1000);
  s.apply({ kind: "cmd-done", paneId: 2 }, 1000);
  s.apply({ kind: "fg", paneId: 3, process: "zsh" }, 1000);
  assert.equal(s.attentionCount(), 2);
  s.apply({ kind: "closed", paneId: 1 }, 2000);
  assert.equal(s.attentionCount(), 1);
  assert.equal(s.get(1), undefined);
});

test("onChange fires once per state change, not per event", () => {
  const s = mk();
  let n = 0;
  s.onChange(() => n++);
  s.apply({ kind: "fg", paneId: 1, process: "zsh" }, 1000);
  s.apply({ kind: "fg", paneId: 1, process: "zsh" }, 2000); // no change
  assert.equal(n, 1);
});

test("isShell handles login-dash and paths", () => {
  assert.ok(isShell("-zsh"));
  assert.ok(isShell("/bin/bash"));
  assert.ok(!isShell("claude"));
});
