// Pure module: never imports xterm. main.ts supplies a line reader over each
// pane's xterm buffer (same idiom as globalsearch.ts); this module just does
// the stack bookkeeping and scrollback framing, so it stays testable without
// a terminal.

export interface ClosedPane {
  title: string;
  cwd?: string;
  startCmd?: string;
  scroll: string;
  wasLastInTab: boolean;
}

export function pushClosed(stack: ClosedPane[], item: ClosedPane, cap = 5): ClosedPane[] {
  const next = [...stack, item];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function popClosed(stack: ClosedPane[]): { stack: ClosedPane[]; item: ClosedPane | null } {
  if (stack.length === 0) return { stack, item: null };
  return { stack: stack.slice(0, -1), item: stack[stack.length - 1] };
}

export function serializeScrollback(read: (i: number) => string, count: number, cap = 10000): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) lines.push(read(i));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(Math.max(0, lines.length - cap)).join("\r\n");
}
