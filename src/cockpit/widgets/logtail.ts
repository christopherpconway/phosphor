// LOG: live tail of a chosen file. Right-click the widget to point it at a
// path; multiple instances follow multiple files.
import { invoke } from "@tauri-apps/api/core";
import { makePanel } from "../sysmon.ts";
import type { Widget } from "../widget.ts";

const POLL_MS = 2000;
export const LOG_LINES = 8;

/** Panel title from a path: basename, uppercased; empty path = placeholder. */
export function logTitle(path: string): string {
  if (!path) return "LOG";
  return (path.split("/").pop() || path).toUpperCase();
}

export function createLogTail(path: string): Widget {
  const panel = makePanel(logTitle(path));
  const pre = document.createElement("pre");
  pre.className = "ck-logtail";
  pre.textContent = path ? "…" : "right-click → set log file";
  panel.body.append(pre);

  const poll = () => {
    if (!panel.root.isConnected || !path) return;
    invoke<string[]>("log_tail", { path, max: LOG_LINES })
      .then((lines) => {
        pre.textContent = lines.length ? lines.join("\n") : "(empty)";
        panel.setStale(false);
      })
      .catch((e) => {
        pre.textContent = String(e);
        panel.setStale(false);
      });
  };
  poll();
  setInterval(poll, POLL_MS);

  return { id: "logtail", title: logTitle(path), root: panel.root };
}
