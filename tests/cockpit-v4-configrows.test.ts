import test from "node:test";
import assert from "node:assert/strict";
import { resetEffects, isEffectRowDisabled } from "../src/cockpit/configscreen.ts";
import { RETRO_DEFAULTS } from "../src/crt.ts";

test("reset restores exactly the defaults, as a copy", () => {
  const tuned = { ...RETRO_DEFAULTS, scanlines: 0.05, noise: 0.99 };
  assert.deepEqual(resetEffects(tuned), RETRO_DEFAULTS);
  assert.notEqual(resetEffects(tuned), RETRO_DEFAULTS);
});

test("effect rows are inert only under nextgen", () => {
  assert.equal(isEffectRowDisabled("nextgen"), true);
  assert.equal(isEffectRowDisabled("retro"), false);
});
