import test from "node:test";
import assert from "node:assert/strict";
import { pairCores } from "../src/cockpit/widgets/cpu.ts";
import { litCells } from "../src/cockpit/widgets/memory.ts";
import { topProcs } from "../src/cockpit/widgets/procs.ts";
import { netState, activeInterface } from "../src/cockpit/widgets/netstatus.ts";

test("cores pair two-up with an odd tail", () => {
  assert.deepEqual(pairCores(4), [[0, 1], [2, 3]]);
  assert.deepEqual(pairCores(3), [[0, 1], [2, null]]);
  assert.deepEqual(pairCores(0), []);
});

test("litCells clamps and rounds", () => {
  assert.equal(litCells(0, 0, 100), 0);
  assert.equal(litCells(50, 100, 100), 50);
  assert.equal(litCells(1, 3, 10), 3);
  assert.equal(litCells(200, 100, 100), 100);
  assert.equal(litCells(-5, 100, 100), 0);
});

test("topProcs sorts by cpu desc, ties by pid asc", () => {
  const p = [
    { pid: 3, name: "c", cpu: 5 },
    { pid: 1, name: "a", cpu: 9 },
    { pid: 2, name: "b", cpu: 5 },
  ];
  assert.deepEqual(topProcs(p, 2).map((x) => x.pid), [1, 2]);
  assert.deepEqual(topProcs(p, 99).map((x) => x.pid), [1, 2, 3]);
  assert.equal(topProcs([], 5).length, 0);
});

test("netState maps liveness and reachability", () => {
  assert.equal(netState(true, 12), "OFFLINE");
  assert.equal(netState(true, null), "OFFLINE");
  assert.equal(netState(false, null), "DEGRADED");
  assert.equal(netState(false, 12), "ONLINE");
});

test("activeInterface prefers the LAN address owner over traffic ranking", () => {
  const nets = [
    { name: "utun3", rx: 900, tx: 900 },
    { name: "en0", rx: 1, tx: 0 },
  ];
  // the busiest interface is utun3, but en0 owns the route
  assert.equal(activeInterface("en0", nets), "en0");
  // an idle link drops out of nets entirely; the owner still names it
  assert.equal(activeInterface("en0", []), "en0");
});

test("activeInterface falls back to traffic, then NONE", () => {
  assert.equal(activeInterface(null, []), "NONE");
  assert.equal(
    activeInterface(null, [
      { name: "lo0", rx: 1, tx: 1 },
      { name: "en0", rx: 10, tx: 5 },
    ]),
    "en0",
  );
});
