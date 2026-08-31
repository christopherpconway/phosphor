# Widget Legibility Audit: v8-attention-snippets

## Reported symptom

Chris, 2026-08-26 (`tasks/todo.md` line 138): "widget text illegible under certain color
schemes - e.g. SHORTCUTS widget unreadable on AMBER. Likely a foreground/contrast token
not derived from scheme luma for some widget text classes."

## Reproduce-in-reasoning first (per the debugging method)

Render pipeline for cockpit widgets:

1. In **cockpit + retro** ("one-CRT") mode, the widget DOM is set `opacity: 0` (still laid
   out, for hit-testing) and `DomLayer.draw()` (`src/cockpit/domrender.ts`) replays each
   zone's live DOM into a 2D canvas layer by walking `getComputedStyle` colors and
   `getBoundingClientRect()` boxes.
2. That layer is composited into the CRT shader (`src/crt.ts`, `SCREEN_FRAG`). For a
   **mono** scheme (`green`, `amber`), the shader does `col = uTint * luma(col) * 1.15`:
   the rendered hue is thrown away entirely and replaced by the scheme's single tint,
   scaled only by the *original* pixel's luma. Under mono, two colors are indistinguishable
   post-shader **iff their luma is equal**, regardless of hue. This is the mechanism the
   report's hypothesis was pointing at.
3. In **cockpit + nextgen** mode, the widget DOM renders normally (visible, un-rasterized,
   `uMono=0`), so true colors show and only a real dark-on-dark literal gray would fail there.

## Audit of every color source (step 2 of the method)

| Source | Found | Verdict |
|---|---|---|
| `main.ts` `refreshVisual()` tokens (`--ck-fg`, `--ck-bg`, `--ck-accent`, `--ck-border`, `--ck-panel-bg`) | All 5 set from the active `ColorScheme` every call | Token-derived, correct |
| Every `.ck-*` color/background in `cockpit.css` | All read `var(--ck-fg/bg/accent/border/panel-bg, <fallback>)` | Token-derived |
| `--ck-warn`, `--ck-track`, `--ck-line` | **Never set** by `refreshVisual`: always falls back to its CSS literal (`#f80`, `rgba(255,255,255,.12)`, `rgba(255,255,255,.15/.25)`) | Architecturally not scheme-derived, but see luma check below: not a confirmed failure, left alone (see Concerns) |
| Canvas widgets (`globe.ts`, `network.ts`, `radar.ts`) | All read `--ck-accent` / `--ck-border` / `--ck-warn` via `getComputedStyle` at draw time; no hardcoded fillStyle/strokeStyle found anywhere in `src/cockpit/` | Token-derived |
| Inline JS color/style assignment across every `widgets/*.ts` | None found (`grep` for `.color =`, `hsl(`, hex literals) | Clean |
| SVG elements in any widget | None (`domrender.ts` only special-cases `HTMLCanvasElement`; an inline `<svg>` would silently vanish the same way `display:contents` did, but none exist) | N/A, noted for future widgets |

## Luma delta computation (step 3)

Computed relative luma (`0.299r + 0.587g + 0.114b`, matching `SCREEN_FRAG`'s own weights)
for every opacity value actually used on text in `cockpit.css`, against GREEN and AMBER
backgrounds:

| Class / state | Opacity | GREEN luma delta | AMBER luma delta | Verdict |
|---|---|---|---|---|
| Full-opacity fg text (rows, headers, most widgets) | 1.0 | 0.761 | 0.744 | Fine |
| `.ck-mini-date`, `.ck-logtail` | 0.85 | 0.647 | 0.632 | Fine |
| `.ck-shortcuts-group` | 0.6 | 0.457 | 0.446 | Fine |
| `.ck-body.dim` (stale widgets) | 0.3 | 0.228 | 0.223 | Fine, though the dimmest in the catalog |
| `--ck-warn` fallback (`#f80`) vs bg | n/a (literal) | 0.568 | 0.565 | Fine |

**No text/background pairing anywhere in the widget catalog falls below a safe luma
margin under GREEN or AMBER.** The "contrast token" hypothesis in the bug report does not
hold up: every color that reaches widget text is already scheme-derived, and none of them
collapse under the mono shader's luma-only compositing.

## Actual root cause (confirmed)

`src/cockpit/cockpit.css:484`: `.ck-shortcuts-row { display: contents; }`, the only
`display: contents` usage anywhere in the codebase (`grep` confirmed), used so each row's
two spans (key chord, label) participate directly in `.ck-shortcuts`'s CSS grid.

`display: contents` elements generate **no box of their own**: `getBoundingClientRect()`
on one always returns `{x:0, y:0, width:0, height:0}` by spec, in every browser engine
including WKWebView. `domrender.ts`'s `drawNode()` did:

```ts
const r = el.getBoundingClientRect();
if (r.width <= 0 || r.height <= 0) return;   // <-- stops here for display:contents
```

So every `.ck-shortcuts-row`, and therefore every key-chord span and label span inside
it, was silently dropped before the recursion ever reached them. Only the group headers
(plain `<div>`, real boxes) got drawn. This reproduces "SHORTCUTS widget unreadable" far
more precisely than a contrast defect would: the rows are not low-contrast, they are
**not painted at all**, in cockpit+retro (one-CRT) mode only. NextGen mode renders the
live DOM directly, so the browser's own layout handles `display: contents` correctly there.
That is also why the report reads as scheme-specific: GREEN and AMBER are the schemes
people actually run in Retro CRT mode (the phosphor look), while the non-mono schemes are
more commonly viewed in NextGen. The bug is render-mode-specific, not scheme-specific; the
report's scheme framing was an artifact of which mode happens to pair with which scheme in
practice.

## Fix applied

`src/cockpit/domrender.ts`, `drawNode()`: when `getComputedStyle(el).display === "contents"`,
skip the box-only path (there is no box to paint bg/border/clip into) and recurse straight
into the element's child nodes/text, passing the same `cr`/`dpr`/`alpha`. This is the single
place in the rasterizer that assumed every visited element has a box; the fix generalizes to
any future widget markup that uses `display: contents` for grid/flex participation, not just
SHORTCUTS.

## Per-widget findings table

| Widget | Color/structure checked | Luma delta (before) | Luma delta (after) | Fix |
|---|---|---|---|---|
| SHORTCUTS (`widgets/shortcuts.ts`) | `.ck-shortcuts-row` rows never rasterized (structural, not luma) | N/A: text not drawn at all | N/A: text now drawn at full token-derived contrast (0.744-0.761, see table above) | `domrender.ts` recurse-through-`display:contents` fix |
| SHORTCUTS group headers | `.ck-shortcuts-group`, opacity 0.6, inherited `--ck-fg` | 0.446-0.457 | unchanged (already correct) | none needed |
| All other cockpit widgets (CLOCK, CPU, MEMORY, DISK, NETWORK, PROCS, AGENTS, SNIPPETS, SPACES, KEYBOARD, LOGTAIL, TIMERS, TOKBURN, FSTREE, GLOBE, RADAR, HWINFO) | Every text/bg color reachable via `--ck-fg/bg/accent/border/panel-bg`, plus `--ck-warn` fallback | 0.223-0.761 across all opacity states used | unchanged (already correct) | none needed |

Confirmed instances of the reported bug: **1** (SHORTCUTS row rasterization), fixed with
a single conditional branch in `domrender.ts`. No confirmed luma-contrast failures exist
in the current color scheme table.

## Test evidence

- `tests/v8-widget-contrast.test.ts` (new): floors every scheme's raw foreground/background
  and cursor/background relative luma delta at 0.3, using `COLOR_SCHEMES`/`SCHEME_IDS` from
  `src/crt.ts` (a pure-data import, no DOM). Across all 10 schemes the real raw deltas run
  0.436-0.875 (min: gotham cursor/bg 0.436 and solarized fg/bg 0.438; max: modern fg/bg and
  cursor/bg 0.875, since modern's cursor equals its foreground): the 0.3 floor sits well
  below all of them, with headroom to catch a real regression. This range is a different
  metric from the 0.223-0.761 opacity-scaled range in the per-widget findings table above
  (the latter includes `.ck-body.dim` at 30% opacity composited onto background; the former
  is always full-opacity token-to-token). Mutation-tested: raising the floor to 0.9 makes
  it fail with a message naming the exact scheme and delta (proven, then reverted before
  committing).
- `tests/v8-widget-contrast.test.ts` also guards the actual fix, not just the ruled-out
  contrast hypothesis: `shouldWalkChildrenDespiteZeroRect` (exported from `domrender.ts`,
  the pure traversal-decision helper `drawNode()` now consults) is tested directly for
  `"contents"` (true), `"none"` (false), and ordinary displays (`"block"`, `"flex"`,
  `"grid"`, `"inline"`, all false). RED proof: reverting the helper's body to `return false`
  (simulating the pre-fix behavior) locally and running `node --test
  tests/v8-widget-contrast.test.ts` failed exactly that test with `false !== true`; the fix
  was restored immediately after and the suite re-verified green.
- Full suite: `npm test` -> 194/194 pass (191 pre-existing + 3 new: 2 contrast-floor tests
  plus the traversal guard).
- `npx tsc --noEmit` -> clean, no output.
- No DOM test added for the `display:contents` fix itself beyond the pure helper, per
  instruction ("do not force a DOM test" / "do not pull in jsdom or any dependency": a full
  drawNode stub would require faking `getComputedStyle`, `HTMLElement`, and
  `HTMLCanvasElement` globals that plain Node does not provide). Visual confirmation is
  covered by Chris's smoke checklist instead (see below).

## Concerns / left alone

- `--ck-warn`, `--ck-track`, `--ck-line` are declared as if they were part of the theme
  token set (the `--ck-` prefix implies it) but are **never populated** by `refreshVisual`:
  they always use their CSS literal fallback. This is a real architectural gap ("not
  derived from scheme luma", verbatim) but it does not currently cause any legibility
  failure (`--ck-warn`'s `#f80` fallback clears both GREEN and AMBER backgrounds by
  >0.56 luma; `--ck-track`/`--ck-line` are backgrounds/borders, not text). Left untouched
  per the "scoped to legibility, no restructuring" constraint; flagging in case a future
  non-mono scheme with a light background is added, since `#f80`-on-light or
  white-alpha-on-light would need deriving from the scheme at that point.
- The SHORTCUTS docked widget's default zone is `bottom` (`widget.ts` line 147); unrelated
  to this bug but worth knowing when smoke-testing.
- Final visual confirmation on GREEN and AMBER is on Chris's smoke checklist
  (`docs/superpowers/plans/v8-smoke-checklist.md`, "Widget legibility" section, added by
  this change), not verified visually here per the task's constraint against launching
  the app.

## Fix round 1 (review response)

Addressed three review findings on commit `8fce7df`:

1. **Coverage gap (Important):** the original `v8-widget-contrast.test.ts` only guarded the
   ruled-out contrast hypothesis, so reverting the `domrender.ts` fix would not have failed
   the suite. Extracted the traversal decision into `shouldWalkChildrenDespiteZeroRect`
   (exported, pure, in `domrender.ts`) and added a direct test for it, per the "Test
   evidence" section above. This required converting `DomLayer`'s constructor off a TS
   parameter-property (`constructor(private zones: ...)`) to a plain field + assignment,
   since Node's strip-only TS loader (used by `node --test`, no transpiler in this repo)
   cannot parse that shorthand; without that change the test file could not import
   `domrender.ts` at all. No behavior change, purely mechanical.
2. **Em dashes (Minor):** removed the em dashes from the two new comments in
   `domrender.ts` (now folded into the JSDoc above the extracted helper), and swept this
   report for the same, replacing each with a colon or a split sentence.
3. **Backwards/mixed-metric prose (Minor):** corrected the "Test evidence" section above;
   the guard's 0.3 floor is compared against the raw per-scheme token deltas (0.436-0.875
   across all 10 schemes), not the opacity-scaled 0.223-0.761 range from the per-widget
   findings table, which was the wrong metric to cite there.
