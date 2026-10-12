// In-app updater: polls latest.json on GitHub Releases (endpoint and public
// key in tauri.conf.json), prompts in the CRT modal style, swaps the bundle in
// place and relaunches. Only the macOS .app and the Linux AppImage can
// self-update; rpm/deb installs fail the check and stay quiet unless asked.
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

const el = document.createElement("div");
el.id = "updateprompt";
el.classList.add("ck-modal", "hidden");
document.body.append(el);

type Button = [label: string, fn: () => void];

function show(title: string, body: string, buttons: Button[]) {
  el.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "panel";
  const h = document.createElement("h1");
  h.textContent = title;
  const why = document.createElement("div");
  why.className = "why";
  why.textContent = body;
  const row = document.createElement("div");
  row.className = "row";
  for (const [label, fn] of buttons) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => {
      el.classList.add("hidden");
      fn();
    });
    row.append(b);
  }
  panel.append(h, why, row);
  el.append(panel);
  el.classList.remove("hidden");
}

const ok: Button = ["OK", () => {}];

async function install(update: Update) {
  let total = 0;
  let got = 0;
  show("UPDATING…", "Downloading.", []);
  try {
    await update.downloadAndInstall((ev) => {
      if (ev.event === "Started") total = ev.data.contentLength ?? 0;
      if (ev.event === "Progress") {
        got += ev.data.chunkLength;
        const pct = total ? ` ${Math.round((got / total) * 100)}%` : "";
        show("UPDATING…", `Downloading${pct}.`, []);
      }
      if (ev.event === "Finished") show("UPDATING…", "Installing.", []);
    });
    await relaunch();
  } catch (e) {
    show("UPDATE FAILED", String(e), [ok]);
  }
}

/** manual: true from the menu item, so "nothing to do" still gets a reply. */
export async function checkForUpdate(manual: boolean) {
  let update: Update | null;
  try {
    update = await check();
  } catch (e) {
    if (manual) show("UPDATE CHECK FAILED", String(e), [ok]);
    return;
  }
  if (!update) {
    if (manual) show("UP TO DATE", "This is the latest Phosphor.", [ok]);
    return;
  }
  show(
    `PHOSPHOR ${update.version} AVAILABLE`,
    `You have ${update.currentVersion}. Update swaps the app in place and relaunches; open panes are restored from the saved workspace.`,
    [
      ["UPDATE", () => void install(update)],
      ["LATER", () => {}],
    ],
  );
}

export function initUpdater() {
  listen("check-updates", () => void checkForUpdate(true));
  // Off the startup path so a slow GitHub never delays the first prompt.
  setTimeout(() => void checkForUpdate(false), 5000);
}
