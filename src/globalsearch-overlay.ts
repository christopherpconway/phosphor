import { plainTextInput } from "./textinput.ts";
import type { PaneHits } from "./globalsearch.ts";
// Results overlay for global search, modeled on Palette: input + grouped
// rows. Groups are one per pane (space / leaf name); rows within a group are
// the hits. Selection is a flat index across every hit row so arrow keys and
// Enter behave like the palette regardless of grouping.

interface Row {
  tabIdx: number;
  paneId: number;
  text: string;
}

export class GlobalSearchOverlay {
  private root: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private rows: Row[] = [];
  private sel = 0;
  private _open = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private query: (q: string) => { results: PaneHits[]; truncated: boolean };
  private jumpTo: (tabIdx: number, paneId: number, q: string) => void;

  constructor(
    query: (q: string) => { results: PaneHits[]; truncated: boolean },
    jumpTo: (tabIdx: number, paneId: number, q: string) => void,
  ) {
    this.query = query;
    this.jumpTo = jumpTo;
    this.root = document.createElement("div");
    this.root.id = "ck-globalsearch";
    this.root.classList.add("hidden");
    const panel = document.createElement("div");
    panel.className = "panel";
    this.input = document.createElement("input");
    plainTextInput(this.input);
    this.input.placeholder = "search every pane and space…";
    this.list = document.createElement("div");
    this.list.className = "items";
    panel.append(this.input, this.list);
    this.root.append(panel);
    document.body.append(this.root);

    this.input.addEventListener("input", () => {
      this.sel = 0;
      if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.render();
      }, 150);
    });
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
      else if (e.key === "ArrowDown") {
        this.sel = Math.min(this.rows.length - 1, this.sel + 1);
        this.highlight();
      } else if (e.key === "ArrowUp") {
        this.sel = Math.max(0, this.sel - 1);
        this.highlight();
      } else if (e.key === "Enter") {
        this.jump(this.sel);
      } else {
        return;
      }
      e.preventDefault();
    });
    this.root.addEventListener("mousedown", (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get open(): boolean {
    return this._open;
  }

  show(): void {
    this._open = true;
    this.input.value = "";
    this.rows = [];
    this.sel = 0;
    this.root.classList.remove("hidden");
    this.render();
    setTimeout(() => this.input.focus(), 0);
  }

  close(): void {
    this._open = false;
    this.root.classList.add("hidden");
  }

  private jump(i: number): void {
    const row = this.rows[i];
    if (!row) return;
    const q = this.input.value;
    this.close();
    this.jumpTo(row.tabIdx, row.paneId, q);
  }

  private render(): void {
    const q = this.input.value;
    this.rows = [];
    this.list.innerHTML = "";
    if (!q) return;
    const { results, truncated } = this.query(q);
    for (const group of results) {
      const header = document.createElement("div");
      header.className = "group";
      header.textContent = group.label;
      this.list.append(header);
      for (const hit of group.hits) {
        const idx = this.rows.length;
        this.rows.push({ tabIdx: group.tabIdx, paneId: group.paneId, text: hit.text });
        const row = document.createElement("div");
        row.className = "item" + (idx === this.sel ? " sel" : "");
        const label = document.createElement("span");
        label.textContent = hit.text.trim().slice(0, 120);
        row.append(label);
        row.addEventListener("click", () => this.jump(idx));
        this.list.append(row);
      }
    }
    if (truncated) {
      const note = document.createElement("div");
      note.className = "group";
      note.textContent = "more matches not shown";
      this.list.append(note);
    }
    this.list.querySelectorAll(".item")[this.sel]?.scrollIntoView({ block: "nearest" });
  }

  private highlight(): void {
    this.list.querySelectorAll(".item").forEach((el, i) => el.classList.toggle("sel", i === this.sel));
    this.list.querySelectorAll(".item")[this.sel]?.scrollIntoView({ block: "nearest" });
  }
}
