// Paste-safety helpers. Tested by tests/textutils.test.ts.

/** Trailing newlines are what make pasted commands auto-execute. */
export const stripTrailingNewlines = (text: string) => text.replace(/[\r\n]+$/, "");

/** Single-quote a path for the shell; embedded single quotes become '\'' */
export const shellQuote = (p: string) => "'" + p.replace(/'/g, "'\\''") + "'";

/** Multi-line pastes get a preview first: interior newlines run commands. */
export const needsPasteConfirm = (text: string) => text.includes("\n");

/** First `max` lines plus a count of what's hidden. */
export function pastePreview(text: string, max = 12): { lines: string[]; more: number } {
  const all = text.split("\n");
  return { lines: all.slice(0, max), more: Math.max(0, all.length - max) };
}
