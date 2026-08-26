import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeWorkspace } from "../src/workspace.ts";

test("v2 file loads and becomes v3", () => {
  const ws = sanitizeWorkspace({
    version: 2,
    tabs: [{ title: "t", layout: { pane: 1, cwd: "/tmp" } }],
    activeTab: 0,
    presets: [],
  });
  assert.equal(ws.version, 3);
  assert.equal(ws.tabs.length, 1);
});

test("pane names validate: strings kept, junk rejected", () => {
  const good = sanitizeWorkspace({
    version: 3,
    tabs: [{ title: "t", layout: { pane: 1, name: "crew" } }],
    activeTab: 0,
    presets: [],
  });
  assert.equal((good.tabs[0].layout as any).name, "crew");
  const bad = sanitizeWorkspace({
    version: 3,
    tabs: [{ title: "t", layout: { pane: 1, name: 42 } }],
    activeTab: 0,
    presets: [],
  });
  assert.deepEqual(bad, sanitizeWorkspace(null));
});
