// eDEX-style angled tab strip for spaces. In cockpit mode this stands in for
// the in-glass space column; CRT mode keeps the glass column untouched.
import type { Widget } from "../widget.ts";

export interface SpaceInfo {
  title: string;
  active: boolean;
  activity: boolean;
}

/** Numbered label; blank titles fall back to the index alone. */
export function spaceLabel(s: SpaceInfo, i: number): string {
  const title = s.title.trim();
  return title ? `${i + 1} ${title}` : `${i + 1}`;
}

export interface SpacesWidget extends Widget {
  refresh(): void;
}

export function createSpaces(deps: {
  getSpaces(): SpaceInfo[];
  selectSpace(i: number): void;
  reorderSpace(from: number, to: number): void;
  openMenu(i: number, x: number, y: number): void;
  addSpace(): void;
}): SpacesWidget {
  const root = document.createElement("nav");
  root.className = "ck-spaces";
  // Drag handle. Without it attachDragHandle would mark the whole strip
  // draggable and a press-and-drift on a tab would drag instead of click.
  const grip = document.createElement("span");
  grip.className = "ck-grip";
  grip.textContent = "⠿";
  root.append(grip);

  const refresh = () => {
    const spaces = deps.getSpaces();
    root.innerHTML = "";
    root.append(grip);
    spaces.forEach((s, i) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "ck-space";
      tab.classList.toggle("is-active", s.active);
      tab.classList.toggle("has-activity", s.activity && !s.active);
      tab.textContent = spaceLabel(s, i);
      // Set by the pointerdown drag handler below; a completed drag also
      // fires a native click, which must not also select the space.
      let dragMoved = false;
      tab.addEventListener("click", () => {
        if (dragMoved) {
          dragMoved = false;
          return;
        }
        deps.selectSpace(i);
      });
      // Same menu the in-glass column uses: rename and close. Stop the
      // bubble, or the zone's widget menu opens on top of this one.
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deps.openMenu(i, e.clientX, e.clientY);
      });
      tab.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const startX = e.clientX, startY = e.clientY;
        let moved = false;
        const onMove = (m: PointerEvent) => {
          if (!moved && Math.hypot(m.clientX - startX, m.clientY - startY) > 6) {
            moved = true;
            tab.classList.add("is-dragging");
          }
        };
        const onUp = (u: PointerEvent) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          tab.classList.remove("is-dragging");
          dragMoved = moved;
          if (!moved) return;
          const over = document.elementFromPoint(u.clientX, u.clientY)?.closest(".ck-space:not(.ck-space-add)");
          if (!over) return;
          const to = Array.from(root.querySelectorAll(".ck-space:not(.ck-space-add)")).indexOf(over);
          if (to >= 0 && to !== i) deps.reorderSpace(i, to);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
      root.append(tab);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "ck-space ck-space-add";
    add.textContent = "+";
    add.title = "New space";
    add.addEventListener("click", () => deps.addSpace());
    root.append(add);
  };
  refresh();

  return { id: "spaces", title: "SPACES", root, refresh };
}
