import { plainTextInput } from "./textinput.ts";
// Cmd+P command palette: type to filter spaces, presets, schemes, actions.
// A DOM overlay above the glass, like the menus; items are provided fresh on
// every open so the space list is always current.

export interface PaletteItem {
  label: string;
  hint?: string;
  fn(): void;
}

/** startsWith beats includes; both are case-insensitive; empty query = all. */
export function paletteFilter(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const starts: PaletteItem[] = [];
  const contains: PaletteItem[] = [];
  for (const it of items) {
    const l = it.label.toLowerCase();
    if (l.startsWith(q)) starts.push(it);
    else if (l.includes(q)) contains.push(it);
  }
  return [...starts, ...contains];
}

export class Palette {
  private root: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private matches: PaletteItem[] = [];
  private sel = 0;
  private _open = false;
  private getItems: () => PaletteItem[];
  private onClose?: () => void;

  constructor(getItems: () => PaletteItem[], onClose?: () => void) {
    this.getItems = getItems;
    this.onClose = onClose;
    this.root = document.createElement("div");
    this.root.id = "ck-palette";
    this.root.classList.add("hidden");
    const panel = document.createElement("div");
    panel.className = "panel";
    this.input = document.createElement("input");
    plainTextInput(this.input);
    this.input.placeholder = "space, preset, scheme, action…";
    this.list = document.createElement("div");
    this.list.className = "items";
    panel.append(this.input, this.list);
    this.root.append(panel);
    document.body.append(this.root);

    this.input.addEventListener("input", () => {
      this.sel = 0;
      this.render();
    });
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
      else if (e.key === "ArrowDown") {
        this.sel = Math.min(this.matches.length - 1, this.sel + 1);
        this.render();
      } else if (e.key === "ArrowUp") {
        this.sel = Math.max(0, this.sel - 1);
        this.render();
      } else if (e.key === "Enter") {
        const it = this.matches[this.sel];
        this.close();
        it?.fn();
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

  toggle(): void {
    if (this._open) this.close();
    else this.show();
  }

  private show(): void {
    this._open = true;
    this.input.value = "";
    this.sel = 0;
    this.root.classList.remove("hidden");
    this.render();
    setTimeout(() => this.input.focus(), 0);
  }

  close(): void {
    this._open = false;
    this.root.classList.add("hidden");
    this.onClose?.();
  }

  private render(): void {
    this.matches = paletteFilter(this.getItems(), this.input.value);
    this.list.innerHTML = "";
    this.matches.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "item" + (i === this.sel ? " sel" : "");
      const label = document.createElement("span");
      label.textContent = it.label;
      row.append(label);
      if (it.hint) {
        const hint = document.createElement("span");
        hint.className = "hint";
        hint.textContent = it.hint;
        row.append(hint);
      }
      row.addEventListener("click", () => {
        this.close();
        it.fn();
      });
      this.list.append(row);
    });
    this.list.children[this.sel]?.scrollIntoView({ block: "nearest" });
  }
}
