// One table for every chord the app owns. handleKey and the window-level
// handler dispatch from it, and the help overlay renders it, so the list the
// user reads cannot drift from the behaviour.
//
// The README key table mirrors this file; update both together.
export const isMac = navigator.platform.toLowerCase().includes("mac");

export interface Shortcut {
  id: string;
  label: string;
  /** Chord as shown to the user on this platform. */
  mac: string;
  group: string;
  match(e: KeyboardEvent): boolean;
}

const appMod = (e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey && e.shiftKey);
const lower = (e: KeyboardEvent) => e.key.toLowerCase();

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: "newline",
    label: "Newline without submitting",
    mac: "Shift+Enter",
    group: "Editing",
    match: (e) => e.key === "Enter" && e.shiftKey,
  },
  {
    id: "paste",
    label: "Smart paste (text, image, or copied file)",
    mac: isMac ? "Cmd+V" : "Ctrl+Shift+V",
    group: "Editing",
    match: (e) => appMod(e) && lower(e) === "v",
  },
  {
    id: "copy",
    label: "Copy selection",
    mac: isMac ? "Cmd+C" : "Ctrl+Shift+C",
    group: "Editing",
    match: (e) => appMod(e) && lower(e) === "c",
  },
  {
    id: "clear",
    label: "Clear scrollback",
    mac: isMac ? "Cmd+K" : "Ctrl+Shift+K",
    group: "Editing",
    match: (e) => appMod(e) && lower(e) === "k",
  },
  {
    id: "find",
    label: "Find in scrollback",
    mac: isMac ? "Cmd+F" : "Ctrl+Shift+F",
    // Cmd+Ctrl+F is fullscreen; the extra Ctrl must not land here.
    group: "Editing",
    match: (e) => (isMac ? e.metaKey && !e.ctrlKey && !e.shiftKey : e.ctrlKey && e.shiftKey) && lower(e) === "f",
  },
  {
    id: "globalsearch",
    label: "Global search (all panes and spaces)",
    mac: isMac ? "Cmd+Shift+F" : "Ctrl+Shift+G",
    group: "Editing",
    match: (e) =>
      isMac
        ? e.metaKey && e.shiftKey && !e.ctrlKey && lower(e) === "f"
        : e.ctrlKey && e.shiftKey && lower(e) === "g",
  },
  {
    id: "newspace",
    label: "New space",
    mac: isMac ? "Cmd+T" : "Ctrl+Shift+T",
    group: "Spaces",
    match: (e) => appMod(e) && !e.shiftKey && lower(e) === "t",
  },
  {
    id: "presets",
    label: "Preset picker",
    mac: isMac ? "Cmd+Shift+T" : "Ctrl+Shift+P",
    group: "Spaces",
    match: (e) => appMod(e) && (isMac ? e.shiftKey && lower(e) === "t" : lower(e) === "p"),
  },
  {
    id: "newwindow",
    label: "New window (pick a configuration in the palette for a different one)",
    mac: isMac ? "Cmd+Shift+N" : "Ctrl+Shift+N",
    group: "Spaces",
    match: (e) => appMod(e) && e.shiftKey && lower(e) === "n",
  },
  {
    id: "switchspace",
    label: "Switch space 1 to 9",
    mac: isMac ? "Cmd+1..9" : "Alt+1..9",
    group: "Spaces",
    match: (e) => (isMac ? e.metaKey : e.altKey) && e.key >= "1" && e.key <= "9",
  },
  {
    id: "splitright",
    label: "Split right",
    mac: isMac ? "Cmd+D" : "Ctrl+Shift+D",
    group: "Panes",
    match: (e) => appMod(e) && (isMac ? !e.shiftKey && lower(e) === "d" : lower(e) === "d"),
  },
  {
    id: "splitdown",
    label: "Split down",
    mac: isMac ? "Cmd+Shift+D" : "Ctrl+Shift+B",
    group: "Panes",
    match: (e) => appMod(e) && (isMac ? e.shiftKey && lower(e) === "d" : lower(e) === "b"),
  },
  {
    id: "close",
    label: "Close pane, then space, then window",
    mac: isMac ? "Cmd+W" : "Ctrl+Shift+W",
    group: "Panes",
    match: (e) => appMod(e) && (isMac ? !e.shiftKey : true) && lower(e) === "w",
  },
  {
    id: "undoclose",
    label: "Undo close pane",
    mac: isMac ? "Cmd+Shift+W" : "Ctrl+Shift+U",
    group: "Panes",
    match: (e) =>
      isMac
        ? e.metaKey && e.shiftKey && !e.ctrlKey && lower(e) === "w"
        : e.ctrlKey && e.shiftKey && lower(e) === "u",
  },
  {
    id: "focuspane",
    label: "Move focus between panes",
    mac: isMac ? "Cmd+Option+Arrows" : "Ctrl+Shift+Arrows",
    group: "Panes",
    match: (e) =>
      (isMac ? e.metaKey && e.altKey : e.ctrlKey && e.shiftKey) && e.key.startsWith("Arrow"),
  },
  {
    id: "broadcast",
    label: "Broadcast typing to all panes in space",
    mac: isMac ? "Cmd+Shift+B" : "Ctrl+Shift+I",
    group: "Panes",
    match: (e) => (isMac ? e.metaKey && e.shiftKey && lower(e) === "b" : e.ctrlKey && e.shiftKey && lower(e) === "i"),
  },
  {
    id: "palette",
    label: "Command palette",
    mac: isMac ? "Cmd+P" : "Ctrl+Shift+Space",
    group: "View",
    match: (e) =>
      isMac
        ? e.metaKey && !e.shiftKey && !e.ctrlKey && lower(e) === "p"
        : e.ctrlKey && e.shiftKey && e.key === " ",
  },
  {
    id: "cockpit",
    label: "Toggle cockpit mode",
    mac: isMac ? "Cmd+Shift+M" : "Ctrl+Shift+M",
    group: "View",
    match: (e) => appMod(e) && e.shiftKey && lower(e) === "m",
  },
  {
    id: "fullscreen",
    label: "Fullscreen",
    mac: "Cmd+Ctrl+F",
    group: "View",
    match: (e) => isMac && e.metaKey && e.ctrlKey && lower(e) === "f",
  },
  {
    id: "config",
    label: "Config screen",
    mac: isMac ? "Cmd+," : "Ctrl+,",
    group: "View",
    match: (e) => (isMac ? e.metaKey : e.ctrlKey) && e.key === ",",
  },
  {
    id: "help",
    label: "This shortcut list",
    mac: isMac ? "Cmd+/" : "Ctrl+/",
    group: "View",
    match: (e) => (isMac ? e.metaKey : e.ctrlKey) && e.key === "/",
  },
];

export function findShortcut(e: KeyboardEvent): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.match(e));
}
