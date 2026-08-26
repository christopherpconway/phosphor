import test from "node:test";
import assert from "node:assert/strict";
import { effectiveVisual } from "../src/cockpit/skin.ts";
import { sanitizeVisual } from "../src/cockpit/visualcfg.ts";
import { COLOR_SCHEMES, EFFECT_KEYS, RETRO_DEFAULTS, SCHEME_IDS } from "../src/crt.ts";

const base = sanitizeVisual(null);

test("nextgen zeroes every effect regardless of stored values", () => {
  const e = effectiveVisual(
    { ...base, renderMode: "nextgen", effects: { ...RETRO_DEFAULTS } },
    false,
  );
  for (const key of EFFECT_KEYS) assert.equal(e.effects[key], 0);
});

test("retro uses the stored effects, not the scheme", () => {
  const tuned = { ...RETRO_DEFAULTS, scanlines: 0.9 };
  const e = effectiveVisual({ ...base, renderMode: "retro", effects: tuned }, false);
  assert.equal(e.effects.scanlines, 0.9);
});

test("colour scheme is independent of render mode", () => {
  for (const renderMode of ["retro", "nextgen"] as const) {
    for (const colorScheme of SCHEME_IDS) {
      const e = effectiveVisual({ ...base, renderMode, colorScheme }, false);
      assert.deepEqual(e.scheme, COLOR_SCHEMES[colorScheme]);
    }
  }
});

test("the config screen lifts effects without changing saved state", () => {
  const saved = { ...base, renderMode: "retro" as const, effects: { ...RETRO_DEFAULTS } };
  const e = effectiveVisual(saved, true);
  for (const key of EFFECT_KEYS) assert.equal(e.effects[key], 0);
  assert.equal(saved.effects.scanlines, RETRO_DEFAULTS.scanlines);
});

test("the returned effects and scheme are copies, not shared references", () => {
  const saved = { ...base, effects: { ...RETRO_DEFAULTS } };
  const e = effectiveVisual(saved, false);
  e.effects.scanlines = 0;
  e.scheme.foreground = "#000000";
  assert.equal(saved.effects.scanlines, RETRO_DEFAULTS.scanlines);
  assert.equal(COLOR_SCHEMES.green.foreground, "#7dffa0");
});

// Carried over from the retired v2 skin suite: a trip through the other mode
// and back must land exactly where it started.
test("round trip through nextgen restores the retro look exactly", () => {
  const saved = { ...base, renderMode: "retro" as const, effects: { ...RETRO_DEFAULTS, glow: 0.8 } };
  const before = effectiveVisual(saved, false);
  const flat = effectiveVisual({ ...saved, renderMode: "nextgen" }, false);
  const after = effectiveVisual(saved, false);
  assert.notDeepEqual(flat.effects, before.effects);
  assert.deepEqual(after, before);
  assert.equal(after.effects.glow, 0.8);
});
