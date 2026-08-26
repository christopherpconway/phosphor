import test from "node:test";
import assert from "node:assert/strict";
import { shortcutGroups } from "../src/cockpit/widgets/shortcuts.ts";
import { SHORTCUTS } from "../src/shortcuts.ts";
import { WIDGET_IDS, WIDGET_TITLES, DEFAULT_LAYOUT, sanitizeWidgets } from "../src/cockpit/widget.ts";

test("every shortcut appears exactly once, grouped in table order", () => {
  const groups = shortcutGroups(SHORTCUTS);
  const flat = groups.flatMap((g) => g.rows.map((r) => r.label));
  assert.equal(flat.length, SHORTCUTS.length);
  assert.deepEqual(flat, SHORTCUTS.map((s) => s.label));
  assert.deepEqual(groups.map((g) => g.group), [...new Set(SHORTCUTS.map((s) => s.group))]);
});

test("shortcuts is a registered widget, off by default, appended for existing layouts", () => {
  assert.ok(WIDGET_IDS.includes("shortcuts"));
  assert.equal(WIDGET_TITLES.shortcuts, "SHORTCUTS");
  assert.equal(DEFAULT_LAYOUT.enabled.shortcuts, false);
  assert.ok(DEFAULT_LAYOUT.zone.bottom.includes("shortcuts"));
  const old = sanitizeWidgets({ zone: { top: [], tabs: ["spaces"], left: [], right: [], bottom: [] }, enabled: {} });
  assert.ok(old.zone.bottom.includes("shortcuts"));
});
