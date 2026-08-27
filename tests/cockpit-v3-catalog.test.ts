import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeWidgets, DEFAULT_LAYOUT, WIDGET_IDS, WIDGET_TITLES } from "../src/cockpit/widget.ts";
import { sanitizeWidgetSize } from "../src/cockpit/config.ts";

test("v2 config upgrades: sysmon dropped, new ids appended to default zones", () => {
  const l = sanitizeWidgets({
    zone: { top: [], left: ["sysmon", "traffic"], right: ["globe", "files"], bottom: ["statusbar"] },
    enabled: { sysmon: true, traffic: true, globe: true, files: true, statusbar: true },
  });
  assert.equal((l.zone.left as string[]).includes("sysmon"), false);
  // surviving ids keep their stored position, retired ones just vanish
  assert.deepEqual(l.zone.left.slice(0, 1), ["traffic"]);
  assert.deepEqual(l.zone.right.slice(0, 2), ["globe", "files"]);
  assert.equal(l.zone.tabs.includes("spaces"), true);
  assert.equal(l.zone.left.includes("cpu"), true);
  assert.equal(l.zone.left.includes("memory"), true);
});

test("keyboard and clockmini default off, everything else on", () => {
  const l = sanitizeWidgets(null);
  assert.equal(l.enabled.keyboard, false);
  assert.equal(l.enabled.clockmini, false);
  assert.equal(l.enabled.cpu, true);
  assert.equal(WIDGET_IDS.length, 23);
});

test("an explicitly stored true beats the default-off", () => {
  const l = sanitizeWidgets({ zone: {}, enabled: { keyboard: true } });
  assert.equal(l.enabled.keyboard, true);
});

test("every id has a home and a title", () => {
  const placed = new Set(Object.values(DEFAULT_LAYOUT.zone).flat());
  for (const id of WIDGET_IDS) {
    assert.equal(placed.has(id), true, `${id} unplaced`);
    assert.equal(typeof WIDGET_TITLES[id], "string", `${id} untitled`);
  }
});

test("widget size sanitizes, clamps, and rounds", () => {
  assert.equal(sanitizeWidgetSize(undefined), 11);
  assert.equal(sanitizeWidgetSize("14"), 11);
  assert.equal(sanitizeWidgetSize(NaN), 11);
  assert.equal(sanitizeWidgetSize(3), 9);
  assert.equal(sanitizeWidgetSize(99), 20);
  assert.equal(sanitizeWidgetSize(13.6), 14);
});
