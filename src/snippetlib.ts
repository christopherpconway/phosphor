// Keyboard-driven snippet library overlay. Same BIOS-screen idiom as
// ConfigScreen: a fixed-position root, its own capture-phase keydown
// listener while open, plain rebuild-on-render (lists here are small).
import { plainTextInput } from "./textinput.ts";
import {
  newSnippetId, PIN_CAP, pinnedInOrder, togglePin, withoutSnippet, withSnippet,
  type Snippet,
} from "./snippets.ts";

export interface SnippetLibDeps {
  get(): Snippet[];
  set(next: Snippet[]): void;
  insert(code: string): void;
}

type Mode = "list" | "form";

export class SnippetLib {
  private deps: SnippetLibDeps;
  private root: HTMLElement | null = null;
  private listEl!: HTMLElement;
  private msgEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private mode: Mode = "list";
  private focus = 0;
  private pendingDeleteId: string | null = null;
  private message = "";
  private editingId: string | null = null; // form target; null = new
  private nameInput: HTMLInputElement | null = null;
  private codeInput: HTMLTextAreaElement | null = null;
  private keydownHandler = (e: KeyboardEvent) => this.onKeydown(e);
  private _open = false;

  constructor(deps: SnippetLibDeps) {
    this.deps = deps;
  }

  get open(): boolean {
    return this._open;
  }

  toggle(): void {
    if (this._open) this.close();
    else this.show();
  }

  /** Pinned first (in pin order), then the rest alphabetically: every
   *  snippet appears, matching the palette's "all snippets" listing. */
  private orderedSnippets(): Snippet[] {
    const all = this.deps.get();
    const pinned = pinnedInOrder(all);
    const pinnedIds = new Set(pinned.map((s) => s.id));
    const rest = all.filter((s) => !pinnedIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...pinned, ...rest];
  }

  private show(): void {
    if (!this.root) this.build();
    this._open = true;
    this.mode = "list";
    this.focus = 0;
    this.pendingDeleteId = null;
    this.message = "";
    this.root!.classList.remove("hidden");
    this.renderList();
    window.addEventListener("keydown", this.keydownHandler, true);
  }

  private close(): void {
    this._open = false;
    this.root?.classList.add("hidden");
    window.removeEventListener("keydown", this.keydownHandler, true);
  }

  private build(): void {
    const root = document.createElement("div");
    root.id = "ck-sniplib";
    root.classList.add("hidden");

    const panel = document.createElement("div");
    panel.className = "panel";

    const h1 = document.createElement("h1");
    h1.textContent = "PHOSPHOR // SNIPPETS";

    this.listEl = document.createElement("div");
    this.listEl.className = "sniplib-list";

    this.msgEl = document.createElement("div");
    this.msgEl.className = "sniplib-msg";

    this.hintEl = document.createElement("div");
    this.hintEl.className = "hint";

    panel.append(h1, this.listEl, this.msgEl, this.hintEl);
    root.append(panel);
    document.body.append(root);
    this.root = root;
  }

  private renderList(): void {
    this.hintEl.textContent =
      "ARROWS MOVE  ENTER INSERT  P PIN  E EDIT  N NEW  D DELETE  ESC CLOSE";
    this.msgEl.textContent = this.message;

    const items = this.orderedSnippets();
    if (this.focus >= items.length) this.focus = Math.max(0, items.length - 1);

    this.listEl.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sniplib-empty";
      empty.textContent = "(no snippets yet: right-click a selection in a pane, or press N)";
      this.listEl.append(empty);
    }
    items.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "sniplib-row" + (i === this.focus ? " focus" : "");
      const pin = document.createElement("span");
      pin.className = "sniplib-pin";
      pin.textContent = s.pinned ? "★" : "☆";
      const name = document.createElement("span");
      name.className = "sniplib-name";
      name.textContent = s.name;
      const code = document.createElement("span");
      code.className = "sniplib-code";
      code.textContent = s.code.split("\n")[0];
      row.append(pin, name, code);
      if (this.pendingDeleteId === s.id) {
        const confirm = document.createElement("span");
        confirm.className = "sniplib-confirm";
        confirm.textContent = "delete? (y)";
        row.append(confirm);
      }
      row.addEventListener("click", () => {
        this.focus = i;
        this.renderList();
      });
      row.addEventListener("dblclick", () => this.insertFocused());
      this.listEl.append(row);
    });
    this.listEl.children[this.focus]?.scrollIntoView({ block: "nearest" });
  }

  private insertFocused(): void {
    const s = this.orderedSnippets()[this.focus];
    if (!s) return;
    this.deps.insert(s.code);
    this.close();
  }

  private onKeydown(e: KeyboardEvent): void {
    // The form's inputs own their own keydown listeners (bubble phase, fired
    // after this capture-phase one returns); step aside so typing works.
    if (this.mode === "form") return;

    const items = this.orderedSnippets();
    const focused = items[this.focus];
    if (this.pendingDeleteId && e.key !== "y") this.pendingDeleteId = null;

    switch (e.key) {
      case "Escape":
        this.close();
        break;
      case "ArrowUp":
        this.focus = Math.max(0, this.focus - 1);
        this.message = "";
        this.renderList();
        break;
      case "ArrowDown":
        this.focus = Math.min(items.length - 1, this.focus + 1);
        this.message = "";
        this.renderList();
        break;
      case "Enter":
        this.insertFocused();
        break;
      case "p":
        if (focused) {
          const result = togglePin(this.deps.get(), focused.id);
          if (result === "cap") {
            this.message = `pin cap reached (${PIN_CAP})`;
          } else {
            this.message = "";
            this.deps.set(result);
          }
          this.renderList();
        }
        break;
      case "e":
        if (focused) this.openForm(focused);
        break;
      case "n":
        this.openForm(null);
        break;
      case "d":
        if (focused) {
          this.pendingDeleteId = focused.id;
          this.renderList();
        }
        break;
      case "y":
        if (this.pendingDeleteId) {
          this.deps.set(withoutSnippet(this.deps.get(), this.pendingDeleteId));
          this.pendingDeleteId = null;
          this.renderList();
        }
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  private openForm(existing: Snippet | null): void {
    this.mode = "form";
    this.editingId = existing?.id ?? null;
    this.message = "";
    this.msgEl.textContent = "";
    this.listEl.innerHTML = "";

    const form = document.createElement("div");
    form.className = "sniplib-form";

    const nameInput = document.createElement("input");
    plainTextInput(nameInput);
    nameInput.className = "sniplib-field";
    nameInput.placeholder = "snippet name";
    nameInput.maxLength = 60;
    nameInput.value = existing?.name ?? "";

    const codeInput = document.createElement("textarea");
    codeInput.className = "sniplib-textarea";
    codeInput.placeholder = "code";
    codeInput.rows = 8;
    codeInput.value = existing?.code ?? "";

    form.append(nameInput, codeInput);
    this.listEl.append(form);
    this.nameInput = nameInput;
    this.codeInput = codeInput;

    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        this.closeForm();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.commitForm();
      }
    };
    nameInput.addEventListener("keydown", onKey);
    codeInput.addEventListener("keydown", onKey);

    this.hintEl.textContent = "CMD+ENTER SAVE  ESC CANCEL";
    setTimeout(() => nameInput.focus(), 0);
  }

  private commitForm(): void {
    const name = this.nameInput?.value.trim() ?? "";
    const code = this.codeInput?.value ?? "";
    if (name && code) {
      const all = this.deps.get();
      const existing = this.editingId ? all.find((s) => s.id === this.editingId) : undefined;
      const snippet: Snippet = existing
        ? { ...existing, name, code }
        : {
          id: newSnippetId(), name, code, pinned: false,
          order: all.length, created: new Date().toISOString(),
        };
      this.deps.set(withSnippet(all, snippet));
    }
    this.closeForm();
  }

  private closeForm(): void {
    this.mode = "list";
    this.editingId = null;
    this.nameInput = null;
    this.codeInput = null;
    this.renderList();
  }
}
