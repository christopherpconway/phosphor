import test from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_SCHEMES, SCHEME_IDS, EFFECT_KEYS, RETRO_DEFAULTS, NEXTGEN_EFFECTS,
} from "../src/crt.ts";

test("every scheme is complete and mono is a colour property", () => {
  assert.equal(SCHEME_IDS.length, 10);
  for (const id of SCHEME_IDS) {
    const s = COLOR_SCHEMES[id];
    assert.match(s.foreground, /^#[0-9a-f]{6}$/i);
    assert.match(s.background, /^#[0-9a-f]{6}$/i);
    assert.match(s.cursor, /^#[0-9a-f]{6}$/i);
    assert.equal(s.tint.length, 3);
    assert.equal(typeof s.mono, "boolean");
  }
  assert.equal(COLOR_SCHEMES.green.mono, true);
  assert.equal(COLOR_SCHEMES.amber.mono, true);
  assert.equal(COLOR_SCHEMES.modern.mono, false);
});

test("no colour scheme carries effects", () => {
  for (const id of SCHEME_IDS) {
    for (const key of EFFECT_KEYS) {
      assert.equal(key in (COLOR_SCHEMES[id] as object), false, `${id} carries ${key}`);
    }
  }
});

test("nextgen is every effect at zero; retro defaults are not", () => {
  for (const key of EFFECT_KEYS) {
    assert.equal(NEXTGEN_EFFECTS[key], 0);
    assert.equal(typeof RETRO_DEFAULTS[key], "number");
  }
  assert.ok(EFFECT_KEYS.some((k) => RETRO_DEFAULTS[k] > 0));
});
