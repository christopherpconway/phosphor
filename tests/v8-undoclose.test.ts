// tests/v8-undoclose.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { popClosed, pushClosed, serializeScrollback } from "../src/undoclose.ts";

const item = (t: string) => ({ title: t, scroll: "", wasLastInTab: false, tabIdx: 0, tabTitle: t }) as any;

test("stack caps at 5, oldest dropped, LIFO pop", () => {
  let s: any[] = [];
  for (const n of ["a", "b", "c", "d", "e", "f"]) s = pushClosed(s, item(n));
  assert.equal(s.length, 5);
  const { stack, item: got } = popClosed(s);
  assert.equal(got!.title, "f");
  assert.equal(stack.length, 4);
  assert.equal(popClosed([]).item, null);
});

test("serializeScrollback keeps the tail and trims trailing blanks", () => {
  const lines = ["one", "two", "three", "", ""];
  const got = serializeScrollback((i) => lines[i], lines.length, 2);
  assert.equal(got, "two\r\nthree");
});
