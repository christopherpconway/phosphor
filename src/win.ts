// Which window am I, and what does that change (PH-9). Pure; read once at boot.
export interface WindowParams { win: string; config: string | null; base: number }

/** "?win=w2&config=night" -> w2, config night, PTY id offset 2e6. Anything else = main. */
export function parseWindowParams(search: string): WindowParams {
  const q = new URLSearchParams(search);
  const win = q.get("win") ?? "main";
  const m = /^w(\d+)$/.exec(win);
  if (!m) return { win: "main", config: null, base: 0 };
  return { win, config: q.get("config"), base: Number(m[1]) * 1_000_000 };
}

/** Labels are w2, w3, ... from a counter kept in localStorage["phosphor-next-win"]. */
export function nextWindowLabel(prev: string | null): { label: string; next: string } {
  const n = Math.max(2, Number.parseInt(prev ?? "", 10) || 2);
  return { label: `w${n}`, next: String(n + 1) };
}
