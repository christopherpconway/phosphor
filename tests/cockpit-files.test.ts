import test from "node:test";
import assert from "node:assert/strict";
import { sortEntries, oscUrlToPath } from "../src/cockpit/files.ts";

test("dirs first, alpha within group, dotfiles last within group", () => {
  const names = sortEntries([
    { name: "zeta.txt", isDir: false, size: 1 },
    { name: ".env", isDir: false, size: 1 },
    { name: "src", isDir: true, size: 0 },
    { name: ".git", isDir: true, size: 0 },
    { name: "alpha.txt", isDir: false, size: 1 },
  ]).map((e) => e.name);
  assert.deepEqual(names, ["src", ".git", "alpha.txt", "zeta.txt", ".env"]);
});

test("osc7 url to path", () => {
  assert.equal(oscUrlToPath("file://Mac.local/Users/cconway/CoWork"), "/Users/cconway/CoWork");
  assert.equal(oscUrlToPath("file:///Users/cconway/My%20Docs"), "/Users/cconway/My Docs");
  assert.equal(oscUrlToPath("not-a-url"), null);
});
