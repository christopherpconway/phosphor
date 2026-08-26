// src/cockpit/bootseq.ts
import { sound } from "./sound.ts";

const LINES = [
  "PHOSPHOR COCKPIT v1",
  "INITIALIZING SUBSYSTEMS ...",
  "  PTY BRIDGE .............. OK",
  "  STATS COLLECTOR ......... OK",
  "  NETWORK TAP ............. OK",
  "  GEO SERVICE ............. OK",
  "  FILESYSTEM SCOPE ........ OK",
  "ALL SYSTEMS NOMINAL",
];

export function runBootSeq(onDone: () => void): void {
  const overlay = document.createElement("div");
  overlay.id = "ck-boot";
  const pre = document.createElement("pre");
  overlay.appendChild(pre);
  document.body.appendChild(overlay);

  let li = 0;
  let ci = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const finish = () => {
    if (timer) clearInterval(timer);
    overlay.remove();
    removeEventListener("keydown", skip, true);
    removeEventListener("mousedown", skip, true);
    onDone();
  };
  // Swallow the skip event: without this the keystroke that dismisses the
  // boot sequence also lands in the shell.
  const skip = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    finish();
  };
  addEventListener("keydown", skip, true);
  addEventListener("mousedown", skip, true);

  timer = setInterval(() => {
    if (li >= LINES.length) return finish();
    ci += 2;
    if (ci >= LINES[li].length) {
      ci = 0;
      li++;
      sound.blip();
    }
    pre.textContent =
      LINES.slice(0, li).join("\n") + (li < LINES.length ? "\n" + LINES[li].slice(0, ci) : "");
  }, 28);
}
