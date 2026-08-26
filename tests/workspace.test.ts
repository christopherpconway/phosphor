import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultWorkspace, maxPaneId, parsePresetHandoff, sanitizeWorkspace } from "../src/workspace.ts";

test("defaultWorkspace is one tab, one pane", () => {
  const ws = defaultWorkspace();
  assert.equal(ws.tabs.length, 1);
  assert.deepEqual(ws.tabs[0].layout, { pane: 1 });
  assert.equal(ws.activeTab, 0);
});

test("garbage input falls back to default", () => {
  for (const bad of [null, "hi", 42, {}, { tabs: "x" }, { tabs: [] }, { tabs: [{ title: 1, layout: { pane: 1 } }] }]) {
    assert.deepEqual(sanitizeWorkspace(bad), defaultWorkspace());
  }
});

test("bad split nodes are rejected", () => {
  const ws = sanitizeWorkspace({
    tabs: [{ title: "t", layout: { split: "x", ratio: 0.5, a: { pane: 1 }, b: { pane: 2 } } }],
  });
  assert.deepEqual(ws, defaultWorkspace());
});

test("valid file round-trips with extras stripped", () => {
  const good = {
    version: 2,
    tabs: [
      {
        title: "crew",
        layout: {
          split: "h",
          ratio: 0.4,
          a: { pane: 1, cwd: "/Users/x/CoWork", startCmd: "claude" },
          b: { pane: 2, cwd: "/Users/x" },
        },
      },
    ],
    activeTab: 0,
    presets: [{ name: "tg", cwd: "/Users/x/CoWork", cmd: "claude" }, { bogus: true }],
    junk: "ignored",
  };
  const ws = sanitizeWorkspace(good);
  assert.equal(ws.tabs[0].title, "crew");
  assert.equal(ws.presets.length, 1);
  assert.equal((ws.tabs[0].layout as any).a.startCmd, "claude");
  assert.ok(!("junk" in ws));
});

test("out-of-range activeTab clamps to 0", () => {
  const ws = sanitizeWorkspace({ tabs: [{ title: "t", layout: { pane: 3 } }], activeTab: 9 });
  assert.equal(ws.activeTab, 0);
  assert.equal(maxPaneId(ws), 3);
});

test("parsePresetHandoff accepts a valid handoff and rejects everything else", () => {
  const good = JSON.stringify({ name: "dev", spaces: [{ title: "api", cwd: "/tmp", cmd: "ssh mini" }] });
  const h = parsePresetHandoff(good);
  assert.ok(h);
  assert.equal(h.name, "dev");
  assert.equal(h.spaces[0].cmd, "ssh mini");
  assert.equal(parsePresetHandoff(null), null);
  assert.equal(parsePresetHandoff("not json"), null);
  assert.equal(parsePresetHandoff(JSON.stringify({ name: "x", spaces: [] })), null);
  assert.equal(parsePresetHandoff(JSON.stringify({ spaces: [{ title: "t", cwd: "/" }] })), null);
  assert.equal(parsePresetHandoff(JSON.stringify({ name: "x", spaces: [{ title: 7, cwd: "/" }] })), null);
});
