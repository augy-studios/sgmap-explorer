// SG Map Explorer's start: the language first (i18n/boot.js), then the theme, the Edge Tray, the
// map and its layers, the modals, the update bar and the welcome tour.

import "../i18n/boot.js";
import { onChange, t } from "../i18n/i18n.js";
import { COLOR_THEMES, applyColorTheme, applyMode, getModePreference, getStoredColorTheme, getStoredMode, initTheme } from "./theme.js";
import { $, $$, closeModal, escapeHtml, hydrateIcons, openModal, wireModals } from "./ui.js";
import { initTray } from "./tray.js";
import { BASEMAPS, getBasemap, initMap, setBasemap } from "./map.js";
import { initLayers, openLayers } from "./layers.js";
import { initCard } from "./card.js";
import { initSave, openSave } from "./map-save.js";
import { initTour, pickers, start as startTour } from "./tour.js";
import { initUpdates } from "./sw-update.js";

// ---------- theme (docs/uwuapps-theme.md 6) ----------

function buildThemeModal() {
  const grid = $("#swatchGrid");
  grid.innerHTML = COLOR_THEMES.map(
    (th) => `
      <button class="swatch" data-theme-id="${th.id}" style="--swatch-color:${th.hex}" type="button" aria-pressed="false">
        <span class="swatch-dot"></span>
        <span class="swatch-label" data-i18n="theme.swatch.${th.id}">${escapeHtml(th.label)}</span>
      </button>`
  ).join("");
  syncThemeModalState();

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-id]");
    if (!btn) return;
    applyColorTheme(btn.dataset.themeId);
    syncThemeModalState();
  });
  $("#modeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    applyMode(btn.dataset.mode);
    syncThemeModalState();
  });
  // A tab left open across 09:00 or 18:00 re-resolves itself; the modal follows.
  document.addEventListener("uwu:modechange", syncThemeModalState);
  onChange(syncThemeModalState);
}

function syncThemeModalState() {
  const activeTheme = getStoredColorTheme();
  const activePreference = getModePreference();
  const resolvedMode = getStoredMode();
  $$("#swatchGrid .swatch").forEach((el) => {
    const on = el.dataset.themeId === activeTheme;
    el.classList.toggle("active", on);
    el.setAttribute("aria-pressed", String(on));
  });
  $$("#modeToggle .mode-btn").forEach((el) => {
    const on = el.dataset.mode === activePreference;
    el.classList.toggle("active", on);
    el.setAttribute("aria-pressed", String(on));
  });
  const note = $("#modeNote");
  if (note) {
    note.hidden = activePreference !== "time";
    if (activePreference === "time") note.textContent = t("theme.following", { mode: t(`theme.mode.${resolvedMode}`) });
  }
  updateThemeButtonIcon();
}

function updateThemeButtonIcon() {
  const span = $("#themeBtn [data-icon]");
  span.setAttribute("data-icon", getStoredMode() === "dark" ? "moon" : "sun");
  hydrateIcons($("#themeBtn"));
}

// ---------- settings ----------

function renderSettings() {
  const current = getBasemap();
  $("#basemapList").innerHTML = BASEMAPS.map(
    (b) => `<button type="button" class="choice" role="radio" aria-checked="${b === current}" data-basemap="${b}">
      <span class="choiceText"><span class="choiceName">${escapeHtml(t(`basemap.${b}.name`))}</span><span class="choiceNote">${escapeHtml(t(`basemap.${b}.note`))}</span></span>
      <span class="choiceMark" aria-hidden="true"></span></button>`
  ).join("");
  $("#tourPicks").innerHTML = pickers();
}

function wireSettings() {
  $("#basemapList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-basemap]");
    if (!btn) return;
    setBasemap(btn.dataset.basemap);
    renderSettings();
    $(`[data-basemap="${btn.dataset.basemap}"]`)?.focus();
  });
  $("#basemapList").addEventListener("keydown", (e) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const i = BASEMAPS.indexOf(getBasemap());
    const nextIndex = (i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : BASEMAPS.length - 1)) % BASEMAPS.length;
    setBasemap(BASEMAPS[nextIndex]);
    renderSettings();
    $(`[data-basemap="${BASEMAPS[nextIndex]}"]`)?.focus();
  });
  $("#tourPicks").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tour]");
    if (!btn) return;
    closeModal("settingsModal");
    setTimeout(() => startTour(btn.dataset.tour), 300);
  });
  onChange(renderSettings);
}

// ---------- boot ----------

function boot() {
  initTheme();
  hydrateIcons();
  updateThemeButtonIcon();
  buildThemeModal();
  wireModals();
  initTray();
  initCard();

  const map = initMap($("#map"));
  initLayers();
  initSave();
  wireSettings();

  $("#themeBtn").addEventListener("click", () => openModal("themeModal"));
  $("#trayLayers").addEventListener("click", () => {
    openModal("layersModal");
    openLayers();
  });
  $("#traySave").addEventListener("click", () => {
    openModal("saveModal");
    openSave();
  });
  $("#settingsBtn").addEventListener("click", () => {
    renderSettings();
    openModal("settingsModal");
  });

  initUpdates();
  let drawn = false;
  // data-map-idle while the map has drawn everything it's asked for: the tour waits on it, and so
  // do the screenshots (scripts/screenshots.mjs).
  map?.on("idle", () => {
    drawn = true;
    document.documentElement.dataset.mapIdle = "1";
  });
  map?.on("dataloading", () => delete document.documentElement.dataset.mapIdle);
  initTour({ ready: () => drawn || !map });
}

boot();
