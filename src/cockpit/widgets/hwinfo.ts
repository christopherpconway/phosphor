// Hardware identity, fetched once. Static for the app's lifetime.
import { invoke } from "@tauri-apps/api/core";
import { makePanel } from "../sysmon.ts";
import type { Widget } from "../widget.ts";

interface HwInfo {
  manufacturer: string;
  model: string;
  chassis: string;
}

export function createHwInfo(): Widget {
  const panel = makePanel("HARDWARE");
  const cells: Record<string, HTMLElement> = {};
  for (const label of ["MANUFACTURER", "MODEL", "CHASSIS"]) {
    const row = document.createElement("div");
    row.className = "ck-fact";
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "v";
    v.textContent = "NO DATA";
    row.append(k, v);
    panel.body.append(row);
    cells[label] = v;
  }

  invoke<HwInfo>("hw_info")
    .then((hw) => {
      cells.MANUFACTURER.textContent = hw.manufacturer || "NO DATA";
      cells.MODEL.textContent = hw.model || "NO DATA";
      cells.CHASSIS.textContent = hw.chassis || "NO DATA";
    })
    .catch(() => {
      // rows already read NO DATA
    });

  return { id: "hwinfo", title: "HARDWARE", root: panel.root };
}
