import test from "node:test";
import assert from "node:assert/strict";
import { SEGMENTS, type SegCtx } from "../src/cockpit/clock.ts";

const stats = {
  cpus: [], loadAvg: 0, memUsed: 0, memTotal: 0, procs: [], nets: [],
  tempC: null, battery: { percent: 87, charging: true }, uptimeSecs: 90060,
  lanIp: "192.168.1.23", tsIp: "100.101.102.103", wifiSsid: "MyHomeNet 5G",
};
const ctx: SegCtx = { now: new Date(2026, 7, 3, 9, 5, 7), stats, wanIp: "8.8.4.4", brand: "WOPR" };

test("segments render", () => {
  assert.equal(SEGMENTS.brand(ctx), "WOPR");
  assert.equal(SEGMENTS.time(ctx), "09:05:07");
  assert.equal(SEGMENTS.date(ctx), "MON AUG 3");
  assert.equal(SEGMENTS.up(ctx), "UP 01:01:01");
  assert.equal(SEGMENTS.bat(ctx), "BAT 87% +CHG");
  assert.equal(SEGMENTS.lan(ctx), "LAN 192.168.1.23");
  assert.equal(SEGMENTS.ts(ctx), "TS 100.101.102.103");
  assert.equal(SEGMENTS.wan(ctx), "WAN 8.8.4.4");
  assert.equal(SEGMENTS.wifi(ctx), "WIFI MyHomeNet 5G");
});

test("segments hide on missing data", () => {
  const empty: SegCtx = { now: ctx.now, stats: null, wanIp: "", brand: "" };
  assert.equal(SEGMENTS.brand(empty), null);
  assert.equal(SEGMENTS.bat(empty), null);
  assert.equal(SEGMENTS.lan(empty), null);
  assert.equal(SEGMENTS.wan(empty), null);
  assert.equal(SEGMENTS.wifi(empty), null);
  assert.notEqual(SEGMENTS.time(empty), null);
});
