// Pure filesystem helpers shared by the fs-grid widget and the OSC 7 cwd
// listener in main.ts. The v2 list-style FilesPanel was replaced by
// widgets/fsgrid.ts; only the pure parts survive.

export interface FsEntry { name: string; isDir: boolean; size: number }

export function sortEntries(entries: FsEntry[]): FsEntry[] {
  const rank = (e: FsEntry) => (e.isDir ? 0 : 2) + (e.name.startsWith(".") ? 1 : 0);
  return [...entries].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function oscUrlToPath(url: string): string | null {
  if (!url.startsWith("file://")) return null;
  const rest = url.slice("file://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  try {
    return decodeURIComponent(rest.slice(slash));
  } catch {
    return null;
  }
}
