// Service worker registration and the "new version is ready" bar (docs/update-bar-spec.md).
// A new worker never activates on its own: it installs, waits, and is only promoted when
// somebody presses Reload here. "Not now" lasts this page view only, and is never stored.

import { onChange, t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";
import { bannerShown } from "./tray.js";

const SW_URL = "/sw.js";

let registration = null;
let waitingWorker = null;
let reloading = false;
let dismissed = false;

function render() {
  const existing = document.querySelector(".update-notice");

  if (!waitingWorker || dismissed) {
    existing?.remove();
    bannerShown(null);
    return;
  }

  const bar = existing ?? document.createElement("div");
  bar.className = "update-notice";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-label", t("update.label"));
  bar.innerHTML = `
    <div class="update-notice-inner">
      <p>${escapeHtml(t("update.ready"))}</p>
      <button type="button" class="btn btn-primary" data-sw-update>${escapeHtml(t("update.reload"))}</button>
      <button type="button" class="btn btn-quiet" data-sw-later>${escapeHtml(t("update.later"))}</button>
    </div>
  `;

  bar.querySelector("[data-sw-update]").addEventListener("click", () => {
    // The only place anything asks for skipWaiting. The reload happens on controllerchange.
    waitingWorker?.postMessage("skip-waiting");
  });

  bar.querySelector("[data-sw-later]").addEventListener("click", () => {
    dismissed = true;
    render();
  });

  if (!existing) document.body.prepend(bar);
  bannerShown(bar);
}

function watchForUpdate() {
  if (!registration) return;

  // A worker already waiting when the page opened: the usual case, the visit after a deploy.
  if (registration.waiting && navigator.serviceWorker.controller) {
    waitingWorker = registration.waiting;
    render();
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      // `installed` with no controller is a first install: nothing to prompt about.
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting ?? installing;
        render();
      }
    });
  });
}

function registerWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register(SW_URL)
    .then((reg) => {
      registration = reg;
      watchForUpdate();
    })
    .catch((cause) => {
      // Private browsing in some browsers, and any http origin that isn't localhost, land here.
      console.warn("service worker registration failed:", cause);
    });

  // The swap, once somebody has accepted it: the reload is served by the new worker.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  // Asked again when the tab comes back, for somebody who's had it open since Tuesday.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") registration?.update().catch(() => {});
  });
}

export function initUpdates() {
  // On load, not at once: installing fetches the whole shell, which shouldn't slow a first visit.
  if (document.readyState === "complete") registerWorker();
  else window.addEventListener("load", registerWorker, { once: true });
  // Redrawn in the new language when it changes.
  onChange(render);
}
