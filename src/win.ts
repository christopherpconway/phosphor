// Which window am I, and what does that change (PH-9). Pure; read once at boot.
export interface WindowParams { win: string; config: string | null; base: number }

const COUNTER_RE = /^w(\d+)$/;
const CONFIG_RE = /^w-(.+)$/;

// FNV-1a: deterministic, no deps, good enough for a window-label offset.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** "?win=w2&config=night" -> w2, config night, PTY id offset 2e6.
 *  "?win=w-night&config=night" -> config-derived label, offset hashed well
 *  above the counter range so the two schemes never collide. Anything else = main. */
export function parseWindowParams(search: string): WindowParams {
  const q = new URLSearchParams(search);
  const win = q.get("win") ?? "main";
  const config = q.get("config");
  const counter = COUNTER_RE.exec(win);
  if (counter) return { win, config, base: Number(counter[1]) * 1_000_000 };
  if (CONFIG_RE.test(win)) return { win, config, base: (1000 + (fnv1a(win) % 999_000)) * 1_000_000 };
  return { win: "main", config: null, base: 0 };
}

/** Labels are w2, w3, ... from a counter kept in localStorage["phosphor-next-win"]. */
export function nextWindowLabel(prev: string | null): { label: string; next: string } {
  const n = Math.max(2, Number.parseInt(prev ?? "", 10) || 2);
  return { label: `w${n}`, next: String(n + 1) };
}

/** Deterministic label for a secondary window tied to config `name`, so the
 *  same config reopens the same window (and finds its own workspace file)
 *  across relaunches instead of drawing a fresh counter label every time. */
export function labelForConfig(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `w-${slug || "x"}`;
}
