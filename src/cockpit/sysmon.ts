export const pushCapped = <T>(arr: T[], v: T, cap: number): T[] =>
  [...arr, v].slice(-cap);

/** Shared bezel-corner panel chrome used by all cockpit panels. */
export function makePanel(title: string) {
  const root = document.createElement("section");
  root.className = "ck-panel";
  const h = document.createElement("header");
  h.textContent = title;
  const body = document.createElement("div");
  body.className = "ck-body";
  const stale = document.createElement("div");
  stale.className = "ck-stale hidden";
  stale.textContent = "NO DATA";
  root.append(h, body, stale);
  return {
    root,
    body,
    setStale(on: boolean) {
      stale.classList.toggle("hidden", !on);
      body.classList.toggle("dim", on);
    },
  };
}

