import { plainTextInput } from "../textinput.ts";
// src/cockpit/configscreen.ts
// BIOS-style full-window config screen. Keyboard-first; replaces #settings.
import {
  EFFECT_KEYS, FONTS, RETRO_DEFAULTS, SCHEME_IDS,
  type Effects, type SchemeId,
} from "../crt.ts";
import {
  BAR_SIZE_MAX, BAR_SIZE_MIN, WIDGET_SIZE_MAX, WIDGET_SIZE_MIN,
  type AttentionCfg, type BarItem, type Sidebars,
} from "./config.ts";
import type { RenderMode } from "./visualcfg.ts";

export function moveFocus(count: number, current: number, delta: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, current + delta));
}

export function moveBarItem(bar: BarItem[], index: number, delta: number): BarItem[] {
  const j = index + delta;
  if (j < 0 || j >= bar.length) return bar;
  const next = bar.map((b) => ({ ...b }));
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** RESET returns a copy, never the shared constant. */
export function resetEffects(_current: Effects): Effects {
  return { ...RETRO_DEFAULTS };
}

/** Effect rows are inert under nextgen: the mode, not the slider, decides. */
export function isEffectRowDisabled(mode: RenderMode): boolean {
  return mode === "nextgen";
}

export function sliderPercent(value: number, min: number, max: number): number {
  const f = (value - min) / (max - min);
  return Math.min(100, Math.max(0, f * 100));
}

export function sliderValueFromX(fraction: number, min: number, max: number, step: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  const raw = min + f * (max - min);
  return +(Math.round(raw / step) * step).toFixed(2);
}

export interface ScreenState {
  renderMode: RenderMode;
  colorScheme: SchemeId;
  effects: Effects;
  font: string;
  fontSize: number;
  sidebars: Sidebars;
  cursorBlink: boolean;
  pasteGuard: boolean;
  boot: boolean;
  sounds: boolean;
  brand: string;
  bar: BarItem[];
  widgetSize: number;
  barSize: number;
  attention: AttentionCfg;
}

export interface CfgBindings {
  get(): ScreenState;
  apply(patch: Partial<ScreenState>): void;
}

// A slider marker carries everything renderRows/pointer handling need beyond
// what read/change already provide: the numeric range for positioning, the
// live value, and the active preset's default (for the tick mark). fontSize
// lives on ScreenState directly rather than under crt, so get()/presetDefault()
// stay opaque functions instead of a single `keyof CrtSettings`: one shape
// covers both the 7 CRT effect keys and FONT SIZE.
interface SliderSpec {
  min: number;
  max: number;
  step: number;
  get(s: ScreenState): number;
  presetDefault(s: ScreenState): number;
  // Pointer drag sets an absolute value, unlike change()'s directional step,
  // so it needs its own patch builder with the same Partial<ScreenState> shape.
  set(s: ScreenState, value: number): Partial<ScreenState>;
}

interface Ctl {
  label: string;
  kind: "cycle" | "toggle";
  /** Rows the current render mode makes inert; rendered dimmed, not hidden. */
  disabled?(s: ScreenState): boolean;
  read(s: ScreenState): string;
  change(s: ScreenState, dir: 1 | -1): Partial<ScreenState>;
  slider?: SliderSpec;
}

// Discriminated row model: TERMINAL/COCKPIT rows drive a generic Ctl; BAR
// rows index into the live (reorderable) bar array; IDENTITY has one row
// that swaps to a text input on activation. Widgets have no rows here:
// they are managed in place (+ button, right-click, pointer drag).
type Row =
  | { kind: "ctl"; ctl: Ctl }
  | { kind: "bar"; index: number }
  | { kind: "brand" };

const cycle = (list: string[], cur: string, dir: number) =>
  list[(list.indexOf(cur) + dir + list.length) % list.length];

function terminalControls(): Ctl[] {
  const ctls: Ctl[] = [
    {
      label: "RENDER MODE",
      kind: "toggle",
      read: (s) => (s.renderMode === "retro" ? "RETRO CRT" : "NEXTGEN"),
      change: (s) => ({ renderMode: s.renderMode === "retro" ? "nextgen" : "retro" }),
    },
    {
      label: "COLOUR SCHEME",
      kind: "cycle",
      read: (s) => s.colorScheme.toUpperCase(),
      change: (s, dir) => ({
        colorScheme: cycle([...SCHEME_IDS], s.colorScheme, dir) as SchemeId,
      }),
    },
    {
      label: "FONT",
      kind: "cycle",
      read: (s) => s.font.toUpperCase(),
      change: (s, dir) => ({ font: cycle(Object.keys(FONTS), s.font, dir) }),
    },
    {
      label: "FONT SIZE",
      kind: "cycle",
      read: (s) => String(s.fontSize),
      change: (s, dir) => ({ fontSize: Math.min(28, Math.max(10, s.fontSize + dir)) }),
      slider: {
        min: 10,
        max: 28,
        step: 1,
        get: (s) => s.fontSize,
        presetDefault: () => 16,
        set: (_s, value) => ({ fontSize: value }),
      },
    },
    {
      label: "RESET EFFECTS",
      kind: "toggle",
      disabled: (s) => isEffectRowDisabled(s.renderMode),
      read: () => "RESET",
      change: (s) => ({ effects: resetEffects(s.effects) }),
    },
  ];
  for (const key of EFFECT_KEYS) {
    ctls.push({
      label: key.toUpperCase(),
      kind: "cycle",
      disabled: (s) => isEffectRowDisabled(s.renderMode),
      read: (s) => s.effects[key].toFixed(2),
      change: (s, dir) => ({
        effects: {
          ...s.effects,
          [key]: Math.min(1, Math.max(0, +(s.effects[key] + dir * 0.05).toFixed(2))),
        },
      }),
      slider: {
        min: 0,
        max: 1,
        step: 0.05,
        get: (s) => s.effects[key],
        presetDefault: () => RETRO_DEFAULTS[key],
        set: (s, value) => ({ effects: { ...s.effects, [key]: value } }),
      },
    });
  }
  return ctls;
}

function cockpitControls(): Ctl[] {
  return [
    {
      label: "SIDEBARS",
      kind: "cycle",
      read: (s) => s.sidebars.toUpperCase(),
      change: (s, dir) => ({
        sidebars: cycle(["both", "left", "right", "none"], s.sidebars, dir) as Sidebars,
      }),
    },
    {
      label: "CURSOR BLINK",
      kind: "toggle",
      read: (s) => (s.cursorBlink ? "ON" : "OFF"),
      change: (s) => ({ cursorBlink: !s.cursorBlink }),
    },
    {
      label: "PASTE GUARD",
      kind: "toggle",
      read: (s) => (s.pasteGuard ? "ON" : "OFF"),
      change: (s) => ({ pasteGuard: !s.pasteGuard }),
    },
    {
      label: "BOOT ANIMATION",
      kind: "toggle",
      read: (s) => (s.boot ? "ON" : "OFF"),
      change: (s) => ({ boot: !s.boot }),
    },
    {
      label: "SOUNDS (TRON)",
      kind: "toggle",
      read: (s) => (s.sounds ? "ON" : "OFF"),
      change: (s) => ({ sounds: !s.sounds }),
    },
    {
      label: "WIDGET FONT SIZE",
      kind: "cycle",
      read: (s) => String(s.widgetSize),
      change: (s, dir) => ({
        widgetSize: Math.min(WIDGET_SIZE_MAX, Math.max(WIDGET_SIZE_MIN, s.widgetSize + dir)),
      }),
      slider: {
        min: WIDGET_SIZE_MIN,
        max: WIDGET_SIZE_MAX,
        step: 1,
        get: (s) => s.widgetSize,
        presetDefault: () => 11,
        set: (_s, value) => ({ widgetSize: value }),
      },
    },
    {
      label: "STATUS BAR FONT SIZE",
      kind: "cycle",
      read: (s) => String(s.barSize),
      change: (s, dir) => ({
        barSize: Math.min(BAR_SIZE_MAX, Math.max(BAR_SIZE_MIN, s.barSize + dir)),
      }),
      slider: {
        min: BAR_SIZE_MIN,
        max: BAR_SIZE_MAX,
        step: 1,
        get: (s) => s.barSize,
        presetDefault: () => 12,
        set: (_s, value) => ({ barSize: value }),
      },
    },
  ];
}

function attentionControls(): Ctl[] {
  return [
    {
      label: "ATTENTION DETECTION",
      kind: "toggle",
      read: (s) => (s.attention.enabled ? "ON" : "OFF"),
      change: (s) => ({ attention: { ...s.attention, enabled: !s.attention.enabled } }),
    },
    {
      label: "MENU BAR ITEM",
      kind: "toggle",
      read: (s) => (s.attention.tray ? "ON" : "OFF"),
      change: (s) => ({ attention: { ...s.attention, tray: !s.attention.tray } }),
    },
    {
      label: "TAB BADGES",
      kind: "toggle",
      read: (s) => (s.attention.badges ? "ON" : "OFF"),
      change: (s) => ({ attention: { ...s.attention, badges: !s.attention.badges } }),
    },
    {
      label: "ATTENTION SOUND",
      kind: "toggle",
      read: (s) => (s.attention.sound ? "ON" : "OFF"),
      change: (s) => ({ attention: { ...s.attention, sound: !s.attention.sound } }),
    },
  ];
}

interface Section {
  title: string;
  ctls: Ctl[];
}

export class ConfigScreen {
  private bindings: CfgBindings;
  private hintSuffix?: string;
  private sections: Section[] = [
    { title: "TERMINAL", ctls: terminalControls() },
    { title: "COCKPIT", ctls: cockpitControls() },
    { title: "ATTENTION", ctls: attentionControls() },
  ];
  private flat: Row[] = [];
  private root: HTMLElement | null = null;
  private rowEls: HTMLElement[] = [];
  private focus = 0;
  private brandEditing = false;
  private brandInputEl: HTMLInputElement | null = null;
  private keydownHandler = (e: KeyboardEvent) => this.onKeydown(e);
  private _open = false;
  private onClose?: () => void;

  constructor(bindings: CfgBindings, hintSuffix?: string, onClose?: () => void) {
    this.bindings = bindings;
    this.hintSuffix = hintSuffix;
    this.onClose = onClose;
  }

  get open(): boolean {
    return this._open;
  }

  toggle(): void {
    if (this._open) this.close();
    else this.show();
  }

  private show(): void {
    if (!this.root) this.build();
    this._open = true;
    this.root!.classList.remove("hidden");
    this.renderRows();
    window.addEventListener("keydown", this.keydownHandler, true);
  }

  private close(): void {
    // An external force-close (e.g. the Cmd+, chord, registered earlier in
    // the same capture phase) can fire mid-edit without ever reaching the
    // brand input's own Escape handler — reconcile before hiding so
    // brandEditing can never outlive the input it describes.
    if (this.brandEditing) this.cancelBrandEdit();
    this._open = false;
    this.root?.classList.add("hidden");
    window.removeEventListener("keydown", this.keydownHandler, true);
    this.onClose?.();
  }

  private build(): void {
    const root = document.createElement("div");
    root.id = "ck-config";
    root.classList.add("hidden");

    const panel = document.createElement("div");
    panel.className = "panel";
    root.append(panel);

    const h1 = document.createElement("h1");
    h1.textContent = "PHOSPHOR // CONFIG";
    panel.append(h1);

    // Sections are real elements so the panel can flow them into two columns
    // without a section splitting across the gap.
    const group = (title: string): HTMLElement => {
      const sec = document.createElement("section");
      sec.className = "group";
      const h2 = document.createElement("h2");
      h2.textContent = title;
      sec.append(h2);
      panel.append(sec);
      return sec;
    };

    const addRow = (label: string, row: Row, into: HTMLElement): void => {
      const idx = this.rowEls.length;
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      const labelEl = document.createElement("span");
      labelEl.className = "label";
      labelEl.textContent = label;
      const value = document.createElement("span");
      value.className = "value";
      rowEl.append(labelEl, value);
      rowEl.addEventListener("click", () => {
        this.focus = idx;
        this.activate(row, 1);
      });
      if (row.kind === "ctl" && row.ctl.slider) {
        const spec = row.ctl.slider;
        const track = this.buildSlider(value);
        // The track's own mousedown drives the value; suppress the row's
        // click-to-activate so a drag doesn't also fire ctl.change(+1).
        track.addEventListener("click", (e) => e.stopPropagation());
        track.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          this.focus = idx;
          this.dragSlider(track, spec, e);
        });
      }
      into.append(rowEl);
      this.rowEls.push(rowEl);
    };

    for (const section of this.sections) {
      const sec = group(section.title);
      for (const ctl of section.ctls) {
        const row: Row = { kind: "ctl", ctl };
        this.flat.push(row);
        addRow(ctl.label, row, sec);
      }
    }

    // Per-element toggles for the status bar: BRAND/TIME/DATE/UP/BAT/LAN/TS/WAN/WIFI.
    const barSec = group("STATUS BAR");
    const barLen = this.bindings.get().bar.length;
    for (let i = 0; i < barLen; i++) {
      const row: Row = { kind: "bar", index: i };
      this.flat.push(row);
      addRow("", row, barSec); // label filled by renderRows(); order changes live
    }

    const idSec = group("IDENTITY");
    const brandRow: Row = { kind: "brand" };
    this.flat.push(brandRow);
    addRow("BRAND", brandRow, idSec);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent =
      "↑↓ Move. Enter/←/→ Toggle. [ ] Reorder. ESC Close." +
      (this.hintSuffix ? "  ·  " + this.hintSuffix : "");
    panel.append(hint);

    document.body.append(root);
    this.root = root;
  }

  // Builds the persistent slider DOM once (track/fill/tick/thumb + value
  // label) and drops it into the row's value cell; renderRows() then only
  // updates positions/text on that same structure instead of rebuilding it.
  private buildSlider(container: HTMLElement): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ck-slider";
    const track = document.createElement("div");
    track.className = "ck-slider-track";
    const fill = document.createElement("div");
    fill.className = "ck-slider-fill";
    const tick = document.createElement("div");
    tick.className = "ck-slider-tick";
    const thumb = document.createElement("div");
    thumb.className = "ck-slider-thumb";
    track.append(fill, tick, thumb);
    const val = document.createElement("span");
    val.className = "ck-slider-val";
    wrap.append(track, val);
    container.replaceChildren(wrap);
    return track;
  }

  private renderSlider(container: HTMLElement, ctl: Ctl, state: ScreenState): void {
    const spec = ctl.slider!;
    const p = sliderPercent(spec.get(state), spec.min, spec.max);
    const d = sliderPercent(spec.presetDefault(state), spec.min, spec.max);
    (container.querySelector(".ck-slider-fill") as HTMLElement).style.width = `${p}%`;
    (container.querySelector(".ck-slider-tick") as HTMLElement).style.left = `${d}%`;
    (container.querySelector(".ck-slider-thumb") as HTMLElement).style.left = `${p}%`;
    (container.querySelector(".ck-slider-val") as HTMLElement).textContent = ctl.read(state);
  }

  // Pointer capture (not window mouse listeners) guarantees the up event
  // reaches `track` even if the cursor leaves the OS window mid-drag, so
  // there's no leaked listener waiting for a mouseup that never comes.
  // `last` gates on the quantized value actually changing: bindings.apply()
  // does JSON.stringify + localStorage + relayout + renderAll, too costly
  // to run on every pixel of mousemove when most don't cross a step boundary.
  private dragSlider(track: HTMLElement, spec: SliderSpec, start: PointerEvent): void {
    let last: number | undefined;
    const apply = (clientX: number): void => {
      const rect = track.getBoundingClientRect();
      const value = sliderValueFromX((clientX - rect.x) / rect.width, spec.min, spec.max, spec.step);
      if (value === last) return;
      last = value;
      this.bindings.apply(spec.set(this.bindings.get(), value));
      this.renderRows();
    };
    track.setPointerCapture(start.pointerId);
    apply(start.clientX);
    const onMove = (e: PointerEvent): void => apply(e.clientX);
    const onUp = (): void => {
      // Unbind first: releasePointerCapture throws NotFoundError on the
      // pointercancel path, which would otherwise leak the move listener and
      // leave the track scrubbing on plain hover.
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", onUp);
      track.removeEventListener("pointercancel", onUp);
      try {
        track.releasePointerCapture(start.pointerId);
      } catch {
        /* pointer already gone */
      }
    };
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
  }

  /** Walk past rows the current render mode has made inert. */
  private nextEnabled(delta: 1 | -1): number {
    const state = this.bindings.get();
    let i = this.focus;
    for (let step = 0; step < this.flat.length; step++) {
      const next = moveFocus(this.flat.length, i, delta);
      if (next === i) return this.focus; // hit an end
      i = next;
      const row = this.flat[i];
      if (!(row.kind === "ctl" && row.ctl.disabled?.(state) === true)) return i;
    }
    return this.focus;
  }

  private renderRows(): void {
    const state = this.bindings.get();
    this.flat.forEach((row, i) => {
      const rowEl = this.rowEls[i];
      const focused = i === this.focus;
      rowEl.classList.toggle("focus", focused);
      const off = row.kind === "ctl" && row.ctl.disabled?.(state) === true;
      rowEl.classList.toggle("disabled", off);
      // The panel scrolls at 80vh; without this the cursor walks off-screen.
      if (focused) rowEl.scrollIntoView({ block: "nearest" });
      if (row.kind === "brand" && this.brandEditing) return; // input owns the value cell
      const value = rowEl.children[1] as HTMLElement;
      if (row.kind === "ctl") {
        if (row.ctl.slider) this.renderSlider(value, row.ctl, state);
        else value.textContent = row.ctl.read(state);
      } else if (row.kind === "bar") {
        const item = state.bar[row.index];
        (rowEl.children[0] as HTMLElement).textContent = item.id.toUpperCase();
        value.textContent = item.on ? "ON" : "OFF";
      } else {
        value.textContent = state.brand;
      }
    });
  }

  private activate(row: Row | undefined, dir: 1 | -1): void {
    if (!row) return;
    if (row.kind === "ctl") {
      const state = this.bindings.get();
      this.bindings.apply(row.ctl.change(state, dir));
      this.renderRows();
    } else if (row.kind === "bar") {
      this.toggleBar(row.index);
    } else {
      this.startBrandEdit();
    }
  }

  private toggleBar(index: number): void {
    const state = this.bindings.get();
    const bar = state.bar.map((b, i) => (i === index ? { ...b, on: !b.on } : b));
    this.bindings.apply({ bar });
    this.renderRows();
  }

  private moveBar(index: number, delta: number): void {
    const before = this.bindings.get().bar;
    const bar = moveBarItem(before, index, delta);
    this.bindings.apply({ bar });
    if (bar !== before) this.focus = moveFocus(this.flat.length, this.focus, delta);
    this.renderRows();
  }

  private startBrandEdit(): void {
    const rowEl = this.rowEls[this.focus];
    const valueCell = rowEl.children[1] as HTMLElement;
    const input = document.createElement("input");
    plainTextInput(input);
    input.maxLength = 24;
    input.value = this.bindings.get().brand;
    valueCell.replaceChildren(input);
    this.brandEditing = true;
    this.brandInputEl = input;
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        this.commitBrandEdit(input.value.trim());
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancelBrandEdit();
      }
    });
    input.focus();
  }

  private commitBrandEdit(value: string): void {
    this.brandEditing = false;
    this.brandInputEl = null;
    this.bindings.apply({ brand: value });
    this.renderRows();
  }

  private cancelBrandEdit(): void {
    this.brandEditing = false;
    this.brandInputEl = null;
    this.renderRows();
  }

  private onKeydown(e: KeyboardEvent): void {
    // While the brand input is focused, let keystrokes reach it untouched.
    // If brandEditing is stale (input lost focus via an external
    // force-close/reopen instead of Enter/Escape) self-heal rather than
    // swallow every key forever: cancel the stray edit and keep handling.
    if (this.brandEditing) {
      if (document.activeElement === this.brandInputEl) return;
      this.cancelBrandEdit();
    }
    const row = this.flat[this.focus];
    switch (e.key) {
      case "Escape":
        this.close();
        break;
      case "ArrowUp":
        this.focus = this.nextEnabled(-1);
        this.renderRows();
        break;
      case "ArrowDown":
        this.focus = this.nextEnabled(1);
        this.renderRows();
        break;
      case "[":
        if (row?.kind === "bar") this.moveBar(row.index, -1);
        break;
      case "]":
        if (row?.kind === "bar") this.moveBar(row.index, 1);
        break;
      case "ArrowLeft":
        this.activate(row, -1);
        break;
      case "ArrowRight":
        this.activate(row, 1);
        break;
      case " ":
      case "Enter":
        // Cycle/stepper controls only move on ArrowLeft/ArrowRight; Enter/Space
        // here would feel like a stuck Right key. Toggles, bar rows, and the
        // brand input still activate normally.
        if (row?.kind === "ctl" && row.ctl.kind === "cycle") break;
        this.activate(row, 1);
        break;
      default:
        break;
    }
    e.preventDefault();
    e.stopPropagation();
  }
}
