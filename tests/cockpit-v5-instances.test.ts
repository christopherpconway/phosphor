import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LAYOUT, addInstance, kindOf, isBaseId, newInstanceId, removeInstance,
  sanitizeWidgets, zoneOf,
} from "../src/cockpit/widget.ts";
import { sanitizeClockTz } from "../src/cockpit/config.ts";
import { clockTitle, searchTimeZones, tzCity, tzOffsetLabel } from "../src/cockpit/widgets/clock.ts";

test("kindOf and isBaseId split instance ids", () => {
  assert.equal(kindOf("clockmini@2"), "clockmini");
  assert.equal(kindOf("clock"), "clock");
  assert.equal(isBaseId("clock"), true);
  assert.equal(isBaseId("clockmini@2"), false);
});

test("addInstance appends a fresh id in the chosen zone", () => {
  const { layout, id } = addInstance(DEFAULT_LAYOUT, "clockmini", "right");
  assert.equal(id, "clockmini@2");
  assert.equal(zoneOf(layout, "clockmini@2"), "right");
  // base clock untouched
  assert.equal(zoneOf(layout, "clockmini"), "left");
  // next one counts past the existing instance
  assert.equal(newInstanceId(layout, "clockmini"), "clockmini@3");
});

test("removeInstance drops the copy, not the base", () => {
  const { layout } = addInstance(DEFAULT_LAYOUT, "clockmini", "right");
  const next = removeInstance(layout, "clockmini@2");
  assert.equal(next.zone.right.includes("clockmini@2"), false);
  assert.equal(next.zone.left.includes("clockmini"), true);
});

test("sanitize keeps clock instances and rejects junk instances", () => {
  const { layout } = addInstance(DEFAULT_LAYOUT, "clockmini", "right");
  const out = sanitizeWidgets(JSON.parse(JSON.stringify(layout)));
  assert.equal(out.zone.right.includes("clockmini@2"), true);

  const bad = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  bad.zone.left.push("procs@2", "clockmini@x", "clockmini@1", "clock@2", "nonsense");
  const cleaned = sanitizeWidgets(bad);
  assert.deepEqual(cleaned, sanitizeWidgets(DEFAULT_LAYOUT));
});

test("sanitizeClockTz keeps only real timezones", () => {
  const out = sanitizeClockTz({
    "clockmini@2": "Asia/Tokyo",
    "clockmini@3": "Not/AZone",
    "clockmini@4": 5,
    "clockmini@5": "",
  });
  assert.deepEqual(out, { "clockmini@2": "Asia/Tokyo" });
});

test("clock titles carry city and UTC offset", () => {
  const jan = new Date("2026-01-15T12:00:00Z");
  assert.equal(tzCity("America/New_York"), "NEW YORK");
  assert.equal(tzOffsetLabel("Asia/Tokyo", jan), "UTC+9");
  assert.equal(tzOffsetLabel("Asia/Kolkata", jan), "UTC+5:30");
  assert.equal(tzOffsetLabel("Europe/London", jan), "UTC+0");
  assert.equal(clockTitle("Asia/Tokyo", "CLOCK", jan), "TOKYO UTC+9");
  assert.equal(clockTitle("", "CLOCK", jan), "CLOCK");
  assert.equal(clockTitle("", "CLOCK MINI", jan), "CLOCK MINI");
});

test("searchTimeZones matches city names first", () => {
  const zones = ["America/New_York", "Asia/Tokyo", "Europe/London", "America/North_Dakota/New_Salem"];
  assert.deepEqual(searchTimeZones("new york", zones), ["America/New_York"]);
  assert.equal(searchTimeZones("tok", zones)[0], "Asia/Tokyo");
  assert.deepEqual(searchTimeZones("", zones), []);
  // real platform list: a well-known city resolves
  assert.equal(searchTimeZones("tokyo")[0], "Asia/Tokyo");
});

test("bar size clamps and defaults", async () => {
  const { sanitizeBarSize } = await import("../src/cockpit/config.ts");
  assert.equal(sanitizeBarSize(12), 12);
  assert.equal(sanitizeBarSize(3), 9);
  assert.equal(sanitizeBarSize(99), 24);
  assert.equal(sanitizeBarSize("big"), 12);
});

test("disk cells and lines", async () => {
  const { diskFrac, litCells, diskLine, DISK_CELLS } = await import("../src/cockpit/widgets/disk.ts");
  const d = { name: "Macintosh HD", mount: "/", total: 1000, used: 410 };
  assert.equal(diskFrac(d), 0.41);
  assert.equal(litCells(0.41), Math.round(0.41 * DISK_CELLS));
  assert.equal(litCells(0.001), 1); // any usage lights at least one cell
  assert.equal(litCells(0), 0);
  assert.equal(diskFrac({ ...d, total: 0 }), 0);
  assert.ok(diskLine(d).endsWith("41%"));
});
