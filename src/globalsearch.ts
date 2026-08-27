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

export function searchLines(read: (i: number) => string, count: number, q: string, max: number): SearchHit[] {
  const needle = q.toLowerCase();
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (let i = 0; i < count && hits.length < max; i++) {
    const text = read(i);
    if (text.toLowerCase().includes(needle)) hits.push({ line: i, text });
  }
  return hits;
}
