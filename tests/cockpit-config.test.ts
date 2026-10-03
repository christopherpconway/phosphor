import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCockpit, DEFAULT_COCKPIT, DEFAULT_BAR } from "../src/cockpit/config.ts";
import { DEFAULT_LAYOUT } from "../src/cockpit/widget.ts";

test("garbage in, defaults out", () => {
  assert.deepEqual(sanitizeCockpit(null), DEFAULT_COCKPIT);
  assert.deepEqual(sanitizeCockpit({ boot: "yes" }), DEFAULT_COCKPIT);
});

test("valid values survive", () => {
  assert.deepEqual(sanitizeCockpit({ boot: false, sounds: false }), {
    boot: false, sounds: false, brand: "", bar: DEFAULT_BAR, widgets: DEFAULT_LAYOUT,
    clockTz: {}, logPaths: {}, timerSecs: 1500, countdown: { target: "", label: "" },
    widgetSize: 11, barSize: 12, sidebars: "both", cursorBlink: true, statusTop: false, pasteGuard: false,
    attention: { enabled: true, tray: true, badges: true, sound: false },
  });
});

test("partial objects fill from defaults", () => {
  assert.deepEqual(sanitizeCockpit({ brand: "WOPR" }), {
    boot: true, sounds: true, brand: "WOPR", bar: DEFAULT_BAR, widgets: DEFAULT_LAYOUT,
    clockTz: {}, logPaths: {}, timerSecs: 1500, countdown: { target: "", label: "" },
    widgetSize: 11, barSize: 12, sidebars: "both", cursorBlink: true, statusTop: false, pasteGuard: false,
    attention: { enabled: true, tray: true, badges: true, sound: false },
  });
});

test("status row position survives; junk falls back to bottom", () => {
  assert.equal(sanitizeCockpit({ statusTop: true }).statusTop, true);
  assert.equal(sanitizeCockpit({ statusTop: "top" }).statusTop, false);
});
