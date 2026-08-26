import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeVisual } from "../src/cockpit/visualcfg.ts";
import { RETRO_DEFAULTS } from "../src/crt.ts";

test("garbage yields green retro with default effects", () => {
  const v = sanitizeVisual(null);
  assert.equal(v.renderMode, "retro");
  assert.equal(v.colorScheme, "green");
  assert.deepEqual(v.effects, RETRO_DEFAULTS);
  assert.notEqual(v.effects, RETRO_DEFAULTS);
});

test("v3 tron theme becomes the tron colour scheme", () => {
  const v = sanitizeVisual({ preset: "green", ck: { theme: "tron" }, crt: { ...RETRO_DEFAULTS } });
  assert.equal(v.colorScheme, "tron");
  assert.equal(v.renderMode, "retro");
});

test("v3 clean preset becomes modern plus nextgen", () => {
  const v = sanitizeVisual({ preset: "clean", ck: { theme: "phosphor" } });
  assert.equal(v.colorScheme, "modern");
  assert.equal(v.renderMode, "nextgen");
});

test("tron wins over clean when both are stored", () => {
  const v = sanitizeVisual({ preset: "clean", ck: { theme: "tron" } });
  assert.equal(v.colorScheme, "tron");
  assert.equal(v.renderMode, "retro");
});

test("tuned v3 effects survive the migration, clamped", () => {
  const v = sanitizeVisual({
    preset: "amber",
    crt: { scanlines: 0.9, curvature: -3, glow: "x", flicker: 0.1 },
  });
  assert.equal(v.colorScheme, "amber");
  assert.equal(v.effects.scanlines, 0.9);
  assert.equal(v.effects.curvature, 0);
  assert.equal(v.effects.glow, RETRO_DEFAULTS.glow);
  assert.equal(v.effects.flicker, 0.1);
});

test("a v4 config passes through untouched", () => {
  const v4 = sanitizeVisual({
    renderMode: "nextgen", colorScheme: "tron",
    effects: { ...RETRO_DEFAULTS }, font: "ibm3270", fontSize: 16,
  });
  assert.equal(v4.renderMode, "nextgen");
  assert.equal(v4.colorScheme, "tron");
  assert.deepEqual(v4.effects, RETRO_DEFAULTS);
});

test("font and size sanitize", () => {
  const v = sanitizeVisual({ preset: "green", font: "nope", fontSize: 999 });
  assert.equal(v.font, "ibm3270");
  assert.equal(v.fontSize, 28);
  assert.equal(sanitizeVisual({ preset: "green", fontSize: 2 }).fontSize, 10);
});
