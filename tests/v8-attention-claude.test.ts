// tests/v8-attention-claude.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { classifyClaude } from "../src/attention/claude.ts";

test("spinner output means working", () => {
  assert.equal(classifyClaude("✻ Churning… (esc to interrupt)"), "working");
  assert.equal(classifyClaude("some output\n(esc to interrupt · 42s)"), "working");
});

test("the input box prompt means needs-input", () => {
  // Claude Code draws its input box with box-drawing chars and a > caret.
  assert.equal(classifyClaude("╭─────╮\n│ > █ │\n╰─────╯"), "needs-input");
  assert.equal(classifyClaude("Do you want to proceed?\n❯ 1. Yes"), "needs-input");
});

test("plain output is no signal", () => {
  assert.equal(classifyClaude("Reading files..."), null);
  assert.equal(classifyClaude(""), null);
});

test("working beats needs-input when both appear (newest wins by order)", () => {
  // The spinner redraws after the box when a turn starts.
  assert.equal(classifyClaude("│ > │\n(esc to interrupt)"), "working");
});
