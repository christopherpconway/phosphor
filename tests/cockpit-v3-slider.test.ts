// tests/cockpit-v3-slider.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { sliderPercent, sliderValueFromX } from "../src/cockpit/configscreen.ts";

test("sliderPercent maps and clamps", () => {
  assert.equal(sliderPercent(0.5, 0, 1), 50);
  assert.equal(sliderPercent(10, 10, 28), 0);
  assert.equal(sliderPercent(28, 10, 28), 100);
  assert.equal(sliderPercent(2, 0, 1), 100);
  assert.equal(sliderPercent(-1, 0, 1), 0);
});

test("sliderValueFromX quantizes to step and clamps", () => {
  assert.equal(sliderValueFromX(0.5, 0, 1, 0.05), 0.5);
  assert.equal(sliderValueFromX(0.505, 0, 1, 0.05), 0.5);
  assert.equal(sliderValueFromX(1.4, 0, 1, 0.05), 1);
  assert.equal(sliderValueFromX(0.66, 10, 28, 1), 22);
});
