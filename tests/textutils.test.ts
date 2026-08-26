import { test } from "node:test";
import assert from "node:assert/strict";
import { shellQuote, stripTrailingNewlines } from "../src/textutils.ts";

test("strips trailing newlines so paste never auto-runs", () => {
  assert.equal(stripTrailingNewlines("ls -la\n"), "ls -la");
  assert.equal(stripTrailingNewlines("ls\r\n\r\n"), "ls");
  assert.equal(stripTrailingNewlines("a\nb\n"), "a\nb"); // interior newlines survive
  assert.equal(stripTrailingNewlines("no newline"), "no newline");
});

test("shell-quotes dropped paths", () => {
  assert.equal(shellQuote("/tmp/plain.png"), "'/tmp/plain.png'");
  assert.equal(shellQuote("/tmp/it's here.png"), "'/tmp/it'\\''s here.png'");
  assert.equal(shellQuote("/tmp/$HOME `x` \"y\""), "'/tmp/$HOME `x` \"y\"'");
});
