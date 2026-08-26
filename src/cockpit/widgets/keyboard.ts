// On-screen keyboard writing into the focused pane. Taps and latched
// modifiers only: no key repeat, US layout only.
import { makePanel } from "../sysmon.ts";
import type { Widget } from "../widget.ts";

export interface Mods {
  shift: boolean;
  ctrl: boolean;
}

const NAMED: Record<string, string> = {
  Enter: "\r",
  Tab: "\t",
  Backspace: "\x7f",
  Esc: "\x1b",
  Space: " ",
  Up: "\x1b[A",
  Down: "\x1b[B",
  Right: "\x1b[C",
  Left: "\x1b[D",
};

// US layout, unshifted key to its shifted symbol.
const SHIFTED: Record<string, string> = {
  "`": "~", "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^",
  "7": "&", "8": "*", "9": "(", "0": ")", "-": "_", "=": "+",
  "[": "{", "]": "}", "\\": "|", ";": ":", "'": "\"",
  ",": "<", ".": ">", "/": "?",
};

// Ctrl maps the @A-Z[\]^_ block to 0x00-0x1f. Ctrl+[ is ESC and Ctrl+\ is
// SIGQUIT, both of which a vi user reaches for constantly.
const CTRL_EXTRA: Record<string, string> = {
  " ": "\x00", "@": "\x00", "[": "\x1b", "\\": "\x1c",
  "]": "\x1d", "^": "\x1e", "_": "\x1f", "?": "\x7f",
};

/** Byte sequence a key press should send, or "" when the key is unknown. */
export function keySequence(key: string, mods: Mods): string {
  // Ctrl reinterprets Space, so it has to beat the named-key lookup.
  if (mods.ctrl && (key === "Space" || key === " ")) return "\x00";
  if (key in NAMED) return NAMED[key];
  if (key.length !== 1) return "";
  const isLetter = /^[a-z]$/i.test(key);
  if (mods.ctrl) {
    if (isLetter) return String.fromCharCode(key.toLowerCase().charCodeAt(0) - 96);
    return CTRL_EXTRA[key] ?? key;
  }
  if (mods.shift) {
    if (isLetter) return key.toUpperCase();
    return SHIFTED[key] ?? key;
  }
  return key;
}

const ROWS: string[][] = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
  ["Tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
  ["Esc", "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "Enter"],
  ["Shift", "z", "x", "c", "v", "b", "n", "m", ",", ".", "/", "Up"],
  ["Ctrl", "Space", "Left", "Down", "Right"],
];

export function createKeyboard(deps: { write(data: string): void }): Widget {
  const panel = makePanel("KEYBOARD");
  const board = document.createElement("div");
  board.className = "ck-keyboard";
  panel.body.append(board);

  const mods: Mods = { shift: false, ctrl: false };
  const modKeys: Record<string, HTMLElement> = {};

  const paintMods = () => {
    modKeys.Shift?.classList.toggle("latched", mods.shift);
    modKeys.Ctrl?.classList.toggle("latched", mods.ctrl);
  };

  for (const row of ROWS) {
    const rowEl = document.createElement("div");
    rowEl.className = "ck-keyrow";
    for (const key of row) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ck-key";
      if (key.length > 1) btn.classList.add("wide");
      btn.textContent = key;
      if (key === "Shift" || key === "Ctrl") {
        modKeys[key] = btn;
        btn.addEventListener("click", () => {
          if (key === "Shift") mods.shift = !mods.shift;
          else mods.ctrl = !mods.ctrl;
          paintMods();
        });
      } else {
        btn.addEventListener("click", () => {
          const seq = keySequence(key, mods);
          if (seq) deps.write(seq);
          // Latched modifiers clear after the next real key.
          mods.shift = false;
          mods.ctrl = false;
          paintMods();
        });
      }
      rowEl.append(btn);
    }
    board.append(rowEl);
  }

  return { id: "keyboard", title: "KEYBOARD", root: panel.root };
}
