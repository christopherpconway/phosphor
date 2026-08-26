import test from "node:test";
import assert from "node:assert/strict";
import { keySequence } from "../src/cockpit/widgets/keyboard.ts";
import { spaceLabel } from "../src/cockpit/widgets/spaces.ts";

const none = { shift: false, ctrl: false };

test("keySequence maps letters, control codes, and named keys", () => {
  assert.equal(keySequence("a", none), "a");
  assert.equal(keySequence("a", { shift: true, ctrl: false }), "A");
  assert.equal(keySequence("a", { shift: false, ctrl: true }), "\x01");
  assert.equal(keySequence("c", { shift: false, ctrl: true }), "\x03");
  assert.equal(keySequence("Enter", none), "\r");
  assert.equal(keySequence("Backspace", none), "\x7f");
  assert.equal(keySequence("Up", none), "\x1b[A");
  assert.equal(keySequence("Nope", none), "");
});

test("keySequence applies the US shifted symbol row", () => {
  assert.equal(keySequence("1", { shift: true, ctrl: false }), "!");
  assert.equal(keySequence("/", { shift: true, ctrl: false }), "?");
  assert.equal(keySequence("1", none), "1");
});

test("keySequence covers the non-letter control block", () => {
  const ctrl = { shift: false, ctrl: true };
  assert.equal(keySequence("[", ctrl), "\x1b");   // ESC
  assert.equal(keySequence("\\", ctrl), "\x1c");  // SIGQUIT
  assert.equal(keySequence("Space", ctrl), "\x00"); // NUL, beats the named lookup
  assert.equal(keySequence(" ", ctrl), "\x00");
  assert.equal(keySequence("Space", none), " ");
});

test("spaceLabel numbers spaces and survives a blank title", () => {
  assert.equal(spaceLabel({ title: "shell", active: true, activity: false }, 0), "1 shell");
  assert.equal(spaceLabel({ title: "   ", active: false, activity: false }, 2), "3");
});
