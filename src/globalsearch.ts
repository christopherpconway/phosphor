// Pure module: never imports xterm. main.ts supplies a line reader over each
// pane's xterm buffer; this module just does the case-insensitive substring
// scan, so it stays testable without a terminal.

export interface SearchHit {
  line: number;
  text: string;
}

export interface PaneHits {
  tabIdx: number;
  paneId: number;
  label: string;
  hits: SearchHit[];
}

export interface SearchResult {
  hits: SearchHit[];
  /** True only when the scan stopped early because it hit `max`, i.e. there
   *  may be more matches beyond what's returned. False when every line was
   *  scanned, even if the hit count happens to equal `max` exactly. */
  stopped: boolean;
}

export function searchLines(read: (i: number) => string, count: number, q: string, max: number): SearchResult {
  const needle = q.toLowerCase();
  if (!needle) return { hits: [], stopped: false };
  const hits: SearchHit[] = [];
  let i = 0;
  for (; i < count; i++) {
    if (hits.length >= max) break;
    const text = read(i);
    if (text.toLowerCase().includes(needle)) hits.push({ line: i, text });
  }
  return { hits, stopped: i < count };
}
