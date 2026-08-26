import test from "node:test";
import assert from "node:assert/strict";
import { parseDuration, formatHMSClock, formatCountdown, parseCountdownTarget } from "../src/cockpit/widgets/timers.ts";
import { blipFor, blipGlow } from "../src/cockpit/widgets/radar.ts";
import { parseTokscale, formatTokens } from "../src/cockpit/widgets/tokburn.ts";
import { logTitle } from "../src/cockpit/widgets/logtail.ts";
import { alertTexts, cpuIsHot, ALERT_CPU_TICKS } from "../src/cockpit/clock.ts";
import { stackedDate } from "../src/cockpit/widgets/clock.ts";
import { sanitizeStringMap, sanitizeCountdown } from "../src/cockpit/config.ts";
import type { Stats } from "../src/cockpit/stats.ts";

test("duration parsing covers the informal forms", () => {
  assert.equal(parseDuration("25m"), 1500);
  assert.equal(parseDuration("1h10m"), 4200);
  assert.equal(parseDuration("90s"), 90);
  assert.equal(parseDuration("10:00"), 600);
  assert.equal(parseDuration("1:00:00"), 3600);
  assert.equal(parseDuration("25"), 1500); // bare number = minutes
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("soon"), null);
});

test("timer and countdown readouts", () => {
  assert.equal(formatHMSClock(90), "01:30");
  assert.equal(formatHMSClock(3661), "1:01:01");
  assert.equal(formatCountdown(0), "00:00");
  assert.equal(formatCountdown(90 * 1000), "01:30");
  assert.equal(formatCountdown((86400 + 3600) * 1000), "1D 1:00:00");
});

test("countdown target parses date, datetime, and label", () => {
  assert.deepEqual(parseCountdownTarget("2026-12-25 christmas"), {
    target: "2026-12-25", label: "christmas",
  });
  assert.deepEqual(parseCountdownTarget("2026-12-25 17:00 party"), {
    target: "2026-12-25T17:00", label: "party",
  });
  assert.equal(parseCountdownTarget("tomorrow"), null);
});

test("radar blips are stable and glow fades behind the sweep", () => {
  const a = blipFor("93.184.216.34");
  assert.deepEqual(blipFor("93.184.216.34"), a);
  assert.ok(a.radius >= 0.25 && a.radius <= 0.9);
  assert.ok(blipGlow(1.0, 1.05) > blipGlow(1.0, 3.0));
  assert.ok(blipGlow(0, Math.PI) >= 0.15);
});

test("tokscale json reduces to cost, io, and hourly bins", () => {
  const json = JSON.stringify({
    entries: [
      { hour: "2026-08-07 00:00", input: 100, output: 200, cost: 1.5 },
      { hour: "2026-08-07 13:00", input: 50, output: 40, cost: 0.5 },
    ],
  });
  const u = parseTokscale(json)!;
  assert.equal(u.cost, 2);
  assert.equal(u.input, 150);
  assert.equal(u.output, 240);
  assert.equal(u.hourly[0], 300);
  assert.equal(u.hourly[13], 90);
  assert.equal(parseTokscale("not json"), null);
  assert.equal(parseTokscale("{}"), null);
});

test("token volumes read like humans expect", () => {
  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(34_607_690), "34.6M");
  assert.equal(formatTokens(1_200), "1.2K");
});

test("log title is the basename, uppercased", () => {
  assert.equal(logTitle("/var/log/n8n.log"), "N8N.LOG");
  assert.equal(logTitle(""), "LOG");
});

test("alerts fire on sustained cpu, hot memory, and full disks", () => {
  const base = {
    cpus: [96, 96], memUsed: 95, memTotal: 100,
    disks: [{ name: "Backup", mount: "/Volumes/Backup", total: 100, used: 95 }],
  } as unknown as Stats;
  assert.equal(cpuIsHot(base), true);
  const texts = alertTexts(base, ALERT_CPU_TICKS);
  assert.deepEqual(texts, ["CPU 96%", "MEM 95%", "DISK BACKUP 95%"]);
  // one-tick spike: no cpu alert
  assert.equal(alertTexts(base, 1).includes("CPU 96%"), false);
  const calm = { cpus: [5], memUsed: 10, memTotal: 100, disks: [] } as unknown as Stats;
  assert.deepEqual(alertTexts(calm, 0), []);
});

test("mini clock date stacks weekday+day over month", () => {
  const d = new Date("2026-08-08T12:00:00Z");
  assert.deepEqual(stackedDate(d, "UTC"), ["SAT 08", "AUG"]);
});

test("string maps and countdown config sanitize", () => {
  assert.deepEqual(sanitizeStringMap({ a: "/x.log", b: 5, c: "" }), { a: "/x.log" });
  assert.deepEqual(sanitizeCountdown({ target: "2026-12-25", label: "xmas" }), {
    target: "2026-12-25", label: "xmas",
  });
  assert.deepEqual(sanitizeCountdown({ target: "whenever" }), { target: "", label: "" });
});

test("palette filter ranks prefix matches first", async () => {
  const { paletteFilter } = await import("../src/palette.ts");
  const items = [
    { label: "SCHEME: DRACULA", fn: () => {} },
    { label: "SPACE 1: crew", fn: () => {} },
    { label: "SPLIT RIGHT", fn: () => {} },
  ];
  assert.deepEqual(paletteFilter(items, "sp").map((i) => i.label), ["SPACE 1: crew", "SPLIT RIGHT"]);
  assert.deepEqual(paletteFilter(items, "dracula").map((i) => i.label), ["SCHEME: DRACULA"]);
  assert.equal(paletteFilter(items, "").length, 3);
});

test("paste guard triggers only on interior newlines", async () => {
  const { needsPasteConfirm, pastePreview } = await import("../src/textutils.ts");
  assert.equal(needsPasteConfirm("one line"), false);
  assert.equal(needsPasteConfirm("rm -rf /\necho done"), true);
  const p = pastePreview(Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n"), 12);
  assert.equal(p.lines.length, 12);
  assert.equal(p.more, 8);
});
