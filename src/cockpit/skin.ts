// Two-axis visual resolver. Render mode decides effects, colour scheme
// decides palette, and neither reaches into the other.
//
// The v3 version replaced saved settings wholesale with a hardcoded TRON_SKIN
// whenever the Tron look was active, so the effect sliders moved and their
// values were discarded. That coupling is what v4 removes.
import {
  COLOR_SCHEMES, NEXTGEN_EFFECTS,
  type ColorScheme, type Effects,
} from "../crt.ts";
import type { SavedVisual } from "./visualcfg.ts";

export interface EffectiveVisual {
  font: string;
  fontSize: number;
  effects: Effects;
  scheme: ColorScheme;
}

/**
 * @param configOpen while the BIOS screen is open the effects lift so edits
 * are visible live. This is a preview only and never touches saved state.
 */
export function effectiveVisual(saved: SavedVisual, configOpen: boolean): EffectiveVisual {
  const flat = saved.renderMode === "nextgen" || configOpen;
  return {
    font: saved.font,
    fontSize: saved.fontSize,
    effects: flat ? { ...NEXTGEN_EFFECTS } : { ...saved.effects },
    scheme: { ...COLOR_SCHEMES[saved.colorScheme] },
  };
}
