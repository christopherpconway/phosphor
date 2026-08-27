// Claude Code state from its own output. One module so a Claude UI change
// touches one file. Signals, not parsing: the spinner always carries
// "esc to interrupt"; the idle input box always shows a box-drawing border
// with a > caret, and choice menus use the ❯ pointer.

const WORKING = /\(esc to interrupt/;
const NEEDS_INPUT = /│\s*>|❯\s*\d+\./;

export function classifyClaude(chunkTail: string): "working" | "needs-input" | null {
  if (!chunkTail) return null;

  const workingMatch = [...chunkTail.matchAll(new RegExp(WORKING, "g"))].pop();
  const workingIndex = workingMatch?.index ?? -1;
  const needsInputMatch = [...chunkTail.matchAll(new RegExp(NEEDS_INPUT, "g"))].pop();
  const needsInputIndex = needsInputMatch?.index ?? -1;

  if (workingIndex === -1 && needsInputIndex === -1) return null;
  return workingIndex > needsInputIndex ? "working" : "needs-input";
}
