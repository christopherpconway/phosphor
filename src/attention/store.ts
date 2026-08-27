// One owner for pane attention state. Pure logic; callers pass `now` so
// tests never touch the clock. Surfaces subscribe via onChange.

export type AttentionState = "idle" | "running" | "needs-input" | "done";

export interface PaneAttention {
  paneId: number;
  state: AttentionState;
  fgProcess: string;
  title: string;
  message: string;
  since: number;
}

export type AttentionEvent =
  | { kind: "fg"; paneId: number; process: string }
  | { kind: "bell"; paneId: number }
  | { kind: "osc9"; paneId: number; text: string }
  | { kind: "title"; paneId: number; title: string }
  | { kind: "cmd-done"; paneId: number }
  | { kind: "focus"; paneId: number }
  | { kind: "trigger"; paneId: number; label: string }
  | { kind: "closed"; paneId: number }
  | { kind: "claude"; paneId: number; state: "working" | "needs-input" };

export const SHELL_NAMES: readonly string[] = [
  "zsh", "bash", "fish", "sh", "dash", "nu",
];

export function isShell(comm: string): boolean {
  const base = comm.replace(/^-/, "").split("/").pop() ?? "";
  return SHELL_NAMES.includes(base);
}

export interface AttentionStore {
  apply(e: AttentionEvent, now: number): void;
  get(id: number): PaneAttention | undefined;
  all(): PaneAttention[];
  attentionCount(): number;
  onChange(fn: () => void): void;
}

const ATTENTION: readonly AttentionState[] = ["needs-input", "done"];

export function createAttentionStore(opts: {
  isFocused(paneId: number): boolean;
}): AttentionStore {
  const panes = new Map<number, PaneAttention>();
  // Tombstones: ids seen in a "closed" event. A late bell or fg for one of
  // these must not resurrect the pane. Ids are never reused in a window
  // session, so the set needs no eviction.
  const closed = new Set<number>();
  const listeners: Array<() => void> = [];

  const entry = (id: number): PaneAttention => {
    let p = panes.get(id);
    if (!p) {
      p = { paneId: id, state: "idle", fgProcess: "", title: "", message: "", since: 0 };
      panes.set(id, p);
    }
    return p;
  };

  const set = (p: PaneAttention, patch: Partial<PaneAttention>, now: number): boolean => {
    const next = { ...p, ...patch };
    const changed =
      next.state !== p.state || next.message !== p.message ||
      next.fgProcess !== p.fgProcess || next.title !== p.title;
    if (changed) {
      if (next.state !== p.state) next.since = now;
      panes.set(p.paneId, next);
    }
    return changed;
  };

  return {
    apply(e, now) {
      let changed = false;
      if (e.kind === "closed") {
        closed.add(e.paneId);
        changed = panes.delete(e.paneId);
      } else if (closed.has(e.paneId)) {
        return;
      } else {
        const p = entry(e.paneId);
        const holding = ATTENTION.includes(p.state);
        switch (e.kind) {
          case "fg": {
            // A held attention state survives fg churn until focus clears it.
            const state: AttentionState = holding
              ? p.state
              : isShell(e.process) ? "idle" : "running";
            changed = set(p, { fgProcess: e.process, state }, now);
            break;
          }
          case "bell":
          case "osc9":
          case "trigger": {
            if (opts.isFocused(e.paneId)) break;
            const message =
              e.kind === "osc9" ? e.text : e.kind === "trigger" ? e.label : p.message;
            changed = set(p, { state: "needs-input", message }, now);
            break;
          }
          case "cmd-done":
            if (!opts.isFocused(e.paneId)) changed = set(p, { state: "done" }, now);
            break;
          case "title":
            changed = set(p, { title: e.title }, now);
            break;
          case "claude":
            if (e.state === "needs-input" && opts.isFocused(e.paneId)) break;
            changed = set(p, { state: e.state === "working" ? "running" : "needs-input" }, now);
            break;
          case "focus":
            changed = set(
              p,
              { state: isShell(p.fgProcess) || p.fgProcess === "" ? "idle" : "running", message: "" },
              now,
            );
            break;
        }
      }
      if (changed) for (const fn of listeners) fn();
    },
    get: (id) => panes.get(id),
    all: () => [...panes.values()],
    attentionCount: () =>
      [...panes.values()].filter((p) => ATTENTION.includes(p.state)).length,
    onChange: (fn) => listeners.push(fn),
  };
}
