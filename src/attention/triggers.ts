// Per-pane output watchers. Matching is bounded to the current last line;
// no scrollback rescans, ever.
export interface Trigger { pattern: string; label: string; regex: RegExp }

const META = /[.*+?^${}()|[\]\\]/;

export function compileTrigger(pattern: string, label: string): Trigger | string {
  const src = META.test(pattern)
    ? pattern
    : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return { pattern, label: label || pattern, regex: new RegExp(src) };
  } catch (e) {
    return String(e);
  }
}

export function matchTrigger(triggers: Trigger[], lastLine: string): Trigger | null {
  for (const t of triggers) {
    if (t.regex.test(lastLine)) return t;
  }
  return null;
}

/** Scan every line of a chunk (bounded to that chunk, no scrollback) and
 *  return the first trigger hit, checking lines in order. */
export function matchChunk(triggers: Trigger[], chunkText: string): Trigger | null {
  for (const line of chunkText.split("\n")) {
    const hit = matchTrigger(triggers, line);
    if (hit) return hit;
  }
  return null;
}
