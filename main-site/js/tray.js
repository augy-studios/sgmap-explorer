// The Edge Tray (docs/edge-tray-spec.md): the column of buttons at the top right, and the tab
// that slides it off the edge and back. Open unless it was left closed; remembered per browser.
// The pre-paint script in index.html applies a closed tray before first paint (6.4), and
// --banner-h keeps it under the update bar (6.3).

import { t, onChange } from "../i18n/i18n.js";

// Keep in step with the pre-paint script in index.html.
export const TRAY_KEY = "sgmap.trayOpen";

let tray;
let tab;
let buttons;

export function setTray(open, { save = true } = {}) {
  tray.classList.toggle("collapsed", !open);
  tab.setAttribute("aria-expanded", String(open));
  const label = t(open ? "tray.hide" : "tray.show");
  tab.setAttribute("aria-label", label);
  tab.title = label;
  // Off-screen buttons must not take focus or clicks.
  buttons.inert = !open;
  document.body.classList.toggle("tray-open", open);
  if (save) {
    try {
      localStorage.setItem(TRAY_KEY, open ? "1" : "0");
    } catch {
      // Remembered for this page view only.
    }
  }
}

export const trayOpen = () => !tray.classList.contains("collapsed");

export function initTray() {
  tray = document.getElementById("tray");
  tab = document.getElementById("trayTab");
  buttons = document.getElementById("trayButtons");
  let open = true;
  try {
    open = localStorage.getItem(TRAY_KEY) !== "0";
  } catch {
    // Open, the default.
  }
  setTray(open, { save: false });
  requestAnimationFrame(() => document.documentElement.classList.remove("tray-start-collapsed"));
  tab.addEventListener("click", () => setTray(!trayOpen()));
  onChange(() => setTray(trayOpen(), { save: false }));
}

// A bar at the top (the update bar): its height as --banner-h, so the tray and the brand line
// start below it.
const sizer = typeof ResizeObserver === "function"
  ? new ResizeObserver(([entry]) => document.documentElement.style.setProperty("--banner-h", `${entry.target.offsetHeight}px`))
  : null;

export function bannerShown(el) {
  sizer?.disconnect();
  if (el) sizer?.observe(el);
  else document.documentElement.style.setProperty("--banner-h", "0px");
}
