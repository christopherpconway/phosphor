// v4 visual config: render mode and colour scheme are independent, and the
// user's tuned effect values persist across a trip through nextgen.
// Pure module: no DOM, no imports from main.ts.
import {
  EFFECT_KEYS, FONTS, RETRO_DEFAULTS, SCHEME_IDS,
  type Effects, type SchemeId,
} from "../crt.ts";

export type RenderMode = "retro" | "nextgen";

export interface SavedVisual {
  renderMode: RenderMode;
  colorScheme: SchemeId;
  effects: Effects;
  font: string;
  fontSize: number;
}

const DEFAULT_FONT = "ibm3270";
const FONT_MIN = 10;
const FONT_MAX = 28;

const isScheme = (v: unknown): v is SchemeId =>
  (SCHEME_IDS as readonly string[]).includes(v as string);

function sanitizeFont(raw: unknown): string {
  return typeof raw === "string" && raw in FONTS ? raw : DEFAULT_FONT;
}

function sanitizeFontSize(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 16;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(raw)));
}

/** Seven effect values, each clamped to [0,1]; anything missing or junk
 *  falls back to the retro default for that key. */
function sanitizeEffects(raw: unknown): Effects {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out = {} as Effects;
  for (const key of EFFECT_KEYS) {
    const v = o[key];
    out[key] =
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(1, Math.max(0, v))
        : RETRO_DEFAULTS[key];
  }
  return out;
}

function defaults(): SavedVisual {
  return {
    renderMode: "retro",
    colorScheme: "green",
    effects: { ...RETRO_DEFAULTS },
    font: DEFAULT_FONT,
    fontSize: 16,
  };
}

/**
 * Migrate a v3 shape. The two axes were entangled there: the cockpit's
 * `ck.theme` decided the Tron look, and the terminal's `preset` decided both
 * palette and effects, with `clean` meaning "no effects".
 */
function migrateV3(o: Record<string, unknown>): SavedVisual {
  const out = defaults();
  const ck = (typeof o.ck === "object" && o.ck !== null ? o.ck : {}) as Record<string, unknown>;
  const preset = o.preset;

  if (ck.theme === "tron") {
    out.colorScheme = "tron";
  } else if (preset === "clean") {
    out.colorScheme = "modern";
    out.renderMode = "nextgen";
  } else if (isScheme(preset)) {
    out.colorScheme = preset;
  }

  out.effects = sanitizeEffects(o.crt);
  out.font = sanitizeFont(o.font);
  out.fontSize = sanitizeFontSize(o.fontSize);
  return out;
}

export function sanitizeVisual(raw: unknown): SavedVisual {
  if (typeof raw !== "object" || raw === null) return defaults();
  const o = raw as Record<string, unknown>;

  // Already v4: sanitize in place rather than re-running the migration, which
  // would read a `preset` key that no longer exists and reset the scheme.
  if (typeof o.renderMode === "string") {
    return {
      renderMode: o.renderMode === "nextgen" ? "nextgen" : "retro",
      colorScheme: isScheme(o.colorScheme) ? o.colorScheme : "green",
      effects: sanitizeEffects(o.effects),
      font: sanitizeFont(o.font),
      fontSize: sanitizeFontSize(o.fontSize),
    };
  }
  return migrateV3(o);
}
