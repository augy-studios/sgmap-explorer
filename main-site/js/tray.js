// The two Edge Trays (docs/edge-tray-spec.md), each with a tab that slides it off its edge and
// back, remembered per browser:
//
// - side: the column at the right, the map's buttons (where I am, face my direction, 3D, north up)
//   and the settings (save offline, theme, language, settings). The spec's tray as it stands.
// - top: the row along the top, the layer switches and the way into All layers. The same tray
//   turned to the top edge, as the spec's left edge variant (9) turns it to the left: it slides
//   up off the edge, and its tab, below it, stays at the top, just under the status bar.
//
// Both: the tab's aria-expanded and label follow the state, the buttons are inert while away, a
// closed tray is applied before first paint (the pre-paint script in index.html, 6.4), and a
// swipe towards the tray's edge puts it away, a swipe out from the tab brings it back. --banner-h
// keeps both under the update bar (6.3).

import { t, onChange } from "../i18n/i18n.js";

// Keep the keys in step with the pre-paint script in index.html.
const TRAYS = {
  side: { key: "sgmap.trayOpen", tray: "tray", tab: "trayTab", buttons: "trayButtons", flag: "side-collapsed", start: "tray-start-collapsed", body: "tray-open", hide: "tray.hide", show: "tray.show" },
  top: { key: "sgmap.topTrayOpen", tray: "topTray", tab: "topTrayTab", buttons: "topTrayButtons", flag: "top-collapsed", start: "top-start-collapsed", body: "top-tray-open", hide: "tray.top-hide", show: "tray.top-show" },
};
const SWIPE_PX = 36;

const el = (id) => document.getElementById(id);

export function setTray(name, open, { save = true } = {}) {
  const c = TRAYS[name];
  el(c.tray).classList.toggle("collapsed", !open);
  // On the root too, so the brand line and the other tray move with it (style.css).
  document.documentElement.classList.toggle(c.flag, !open);
  const tab = el(c.tab);
  tab.setAttribute("aria-expanded", String(open));
  const label = t(open ? c.hide : c.show);
  tab.setAttribute("aria-label", label);
  tab.title = label;
  // Off-screen buttons must not take focus or clicks.
  el(c.buttons).inert = !open;
  document.body.classList.toggle(c.body, open);
  if (save) {
    try {
      localStorage.setItem(c.key, open ? "1" : "0");
    } catch {
      // Remembered for this page view only.
    }
  }
}

export const trayOpen = (name) => !el(TRAYS[name].tray).classList.contains("collapsed");

// A swipe on the tray towards its edge puts it away; one on the tab away from the edge brings it
// back. A swipe isn't also a tap on the button it started on.
function swipes(name) {
  const c = TRAYS[name];
  let from = null;
  const area = el(c.tray);
  area.addEventListener("pointerdown", (e) => {
    from = { x: e.clientX, y: e.clientY };
  });
  // On the window: a swipe to the edge can end past the tray, or off the screen.
  window.addEventListener("pointerup", (e) => {
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    from = null;
    const toEdge = name === "side" ? dx > SWIPE_PX && Math.abs(dx) > Math.abs(dy) : dy < -SWIPE_PX && Math.abs(dy) > Math.abs(dx);
    const fromEdge = name === "side" ? dx < -SWIPE_PX && Math.abs(dx) > Math.abs(dy) : dy > SWIPE_PX && Math.abs(dy) > Math.abs(dx);
    const open = trayOpen(name);
    if ((open && toEdge) || (!open && fromEdge)) {
      setTray(name, !open);
      // The click the browser may send after this pointerup is the swipe's, not a tap; one that
      // doesn't come mustn't eat the next real tap.
      const eat = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      area.addEventListener("click", eat, { capture: true, once: true });
      setTimeout(() => area.removeEventListener("click", eat, { capture: true }), 300);
    }
  });
  window.addEventListener("pointercancel", () => (from = null));
}

export function initTray() {
  for (const name of Object.keys(TRAYS)) {
    const c = TRAYS[name];
    let open = true;
    try {
      open = localStorage.getItem(c.key) !== "0";
    } catch {
      // Open, the default.
    }
    setTray(name, open, { save: false });
    el(c.tab).addEventListener("click", () => setTray(name, !trayOpen(name)));
    swipes(name);
  }
  requestAnimationFrame(() => document.documentElement.classList.remove("tray-start-collapsed", "top-start-collapsed"));
  onChange(() => {
    for (const name of Object.keys(TRAYS)) setTray(name, trayOpen(name), { save: false });
  });
}

// A bar at the top (the update bar): its height as --banner-h, so the trays and the brand line
// start below it.
const sizer = typeof ResizeObserver === "function"
  ? new ResizeObserver(([entry]) => document.documentElement.style.setProperty("--banner-h", `${entry.target.offsetHeight}px`))
  : null;

export function bannerShown(node) {
  sizer?.disconnect();
  if (node) sizer?.observe(node);
  else document.documentElement.style.setProperty("--banner-h", "0px");
}
