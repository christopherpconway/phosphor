// Snippet model + immutable helpers. IO happens in main.ts via Tauri commands.

export interface Snippet {
  id: string;
  name: string;
  code: string;
  pinned: boolean;
  order: number;
  created: string;
}

export const PIN_CAP = 10;

/** Parse untrusted snippet data; invalid entries are dropped, defaults applied. */
export function sanitizeSnippets(raw: unknown): Snippet[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((o, index) => ({
      id: typeof o.id === "string" ? o.id : String(index),
      name: typeof o.name === "string" ? o.name.slice(0, 60) : "",
      code: typeof o.code === "string" ? o.code : "",
      pinned: typeof o.pinned === "boolean" ? o.pinned : false,
      order: typeof o.order === "number" ? o.order : index,
      created: typeof o.created === "string" ? o.created : new Date().toISOString(),
    }))
    .filter((s): s is Snippet => s.name.length > 0 && s.code.length > 0);
}

/** New array with snippet inserted or replaced by id. */
export function withSnippet(list: readonly Snippet[], s: Snippet): Snippet[] {
  const idx = list.findIndex((x) => x.id === s.id);
  if (idx >= 0) {
    const out = [...list];
    out[idx] = s;
    return out;
  }
  return [...list, s];
}

/** New array with snippet id removed. */
export function withoutSnippet(list: readonly Snippet[], id: string): Snippet[] {
  return list.filter((s) => s.id !== id);
}

/** Toggle pin state; return "cap" if pinning would exceed PIN_CAP. */
export function togglePin(list: readonly Snippet[], id: string): Snippet[] | "cap" {
  const item = list.find((s) => s.id === id);
  if (!item) return [...list];

  if (!item.pinned) {
    // Pinning: check cap
    const pinnedCount = list.filter((s) => s.pinned).length;
    if (pinnedCount >= PIN_CAP) return "cap";
  }

  return list.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s);
}

/** Snippets sorted by pinned order, then by name. */
export function pinnedInOrder(list: readonly Snippet[]): Snippet[] {
  return [...list]
    .filter((s) => s.pinned)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
}

/** Search snippets by query; rank name matches above code-only. */
export function searchSnippets(
  list: readonly Snippet[],
  q: string,
): { pinned: Snippet[]; unpinned: Snippet[] } {
  if (!q) {
    return {
      pinned: pinnedInOrder(list),
      unpinned: [],
    };
  }

  const query = q.toLowerCase();

  // Score entries: 0 = name startsWith, 1 = name includes, 2 = code includes, 999 = no match
  const scored = list.map((s) => {
    const nameL = s.name.toLowerCase();
    const codeL = s.code.toLowerCase();
    let rank: number;

    if (nameL.startsWith(query)) {
      rank = 0;
    } else if (nameL.includes(query)) {
      rank = 1;
    } else if (codeL.includes(query)) {
      rank = 2;
    } else {
      rank = 999;
    }

    return { s, rank };
  });

  // Sort: rank first, then by pinned-order (pinned first, then by order+name), then by name
  const sorted = scored
    .filter(({ rank }) => rank < 999)
    .sort(({ s: a, rank: ar }, { s: b, rank: br }) => {
      if (ar !== br) return ar - br;
      // Within rank: pinned comes first
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      // Then by order
      if (a.order !== b.order) return a.order - b.order;
      // Then by name
      return a.name.localeCompare(b.name);
    })
    .map(({ s }) => s);

  const pinned = sorted.filter((s) => s.pinned);
  const unpinned = sorted.filter((s) => !s.pinned);

  return { pinned, unpinned };
}

/** Generate a new snippet id: "s" + epoch millis + 4 random base36 chars. */
export function newSnippetId(): string {
  const ms = Date.now();
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `s${ms}${rand}`;
}
