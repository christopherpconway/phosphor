// Help overlay. Renders the one shortcut table, so it cannot list a chord the
// app does not actually handle.
import { SHORTCUTS, type Shortcut } from "../shortcuts.ts";

export class ShortcutsOverlay {
  private root: HTMLElement | null = null;
  private _open = false;

  get open(): boolean {
    return this._open;
  }

  toggle(): void {
    if (this._open) this.close();
    else this.show();
  }

  close(): void {
    this._open = false;
    this.root?.classList.add("hidden");
  }

  private show(): void {
    if (!this.root) this.build();
    this._open = true;
    this.root!.classList.remove("hidden");
  }

  private build(): void {
    const root = document.createElement("div");
    root.id = "ck-shortcuts";
    root.className = "hidden";
    const panel = document.createElement("div");
    panel.className = "panel";
    root.append(panel);

    const h1 = document.createElement("h1");
    h1.textContent = "PHOSPHOR // SHORTCUTS";
    panel.append(h1);

    const groups = new Map<string, Shortcut[]>();
    for (const s of SHORTCUTS) {
      const list = groups.get(s.group) ?? [];
      list.push(s);
      groups.set(s.group, list);
    }

    for (const [title, list] of groups) {
      const sec = document.createElement("section");
      sec.className = "group";
      const h2 = document.createElement("h2");
      h2.textContent = title.toUpperCase();
      sec.append(h2);
      for (const s of list) {
        const row = document.createElement("div");
        row.className = "row";
        const label = document.createElement("span");
        label.className = "label";
        label.textContent = s.label;
        const chord = document.createElement("span");
        chord.className = "chord";
        chord.textContent = s.mac;
        row.append(label, chord);
        sec.append(row);
      }
      panel.append(sec);
    }

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "ESC CLOSE";
    panel.append(hint);

    root.addEventListener("click", () => this.close());
    document.body.append(root);
    this.root = root;
  }
}
