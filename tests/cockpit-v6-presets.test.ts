import test from "node:test";
import assert from "node:assert/strict";
import { presetSpaces, snapshotPreset, sanitizeWorkspace, defaultWorkspace } from "../src/workspace.ts";

test("a single-space preset normalizes to one SpaceSpec", () => {
  assert.deepEqual(presetSpaces({ name: "hub", cwd: "/x", cmd: "htop" }), [{ title: "htop", cwd: "/x", cmd: "htop" }]);
  assert.deepEqual(presetSpaces({ name: "home", cwd: "/h" }), [{ title: "home", cwd: "/h", cmd: undefined }]);
});

test("snapshotPreset keeps the first space at the top level for old readers", () => {
  const p = snapshotPreset("acio", [
    { title: "edit", cwd: "/a", cmd: undefined },
    { title: "logs", cwd: "/b", cmd: "tail -f x" },
  ]);
  assert.equal(p.name, "acio");
  assert.equal(p.cwd, "/a");
  assert.equal(p.cmd, undefined);
  assert.equal(p.spaces?.length, 2);
  assert.deepEqual(presetSpaces(p).map((s) => s.title), ["edit", "logs"]);
});

test("sanitizeWorkspace keeps valid multi-space presets and drops broken ones", () => {
  const ws = { ...defaultWorkspace(), presets: [
    { name: "ok1", cwd: "/x" },
    { name: "ok2", cwd: "/x", spaces: [{ title: "a", cwd: "/a" }, { title: "b", cwd: "/b", cmd: "vim" }] },
    { name: "bad", cwd: "/x", spaces: [{ title: 3, cwd: "/a" }] },
    { name: "bad2", cwd: "/x", spaces: "nope" },
  ] };
  const out = sanitizeWorkspace(ws);
  assert.deepEqual(out.presets.map((p) => p.name), ["ok1", "ok2"]);
  assert.equal(out.presets[1].spaces?.length, 2);
});
