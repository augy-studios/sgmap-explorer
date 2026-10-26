// Small shared UI pieces: icons from data-icon, the modals (open, close, focus kept inside and
// handed back), escaping text for innerHTML, and the status line over the map.

import { icon } from "./icons.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Safe to call repeatedly; re-renders when data-icon changes.
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    if (el.dataset.iconRendered === name) return;
    el.innerHTML = icon(name);
    el.dataset.iconRendered = name;
  });
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- modals ----------

const openers = new Map(); // modal id -> the element focus goes back to
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function openModal(id, { focus } = {}) {
  const backdrop = document.getElementById(id);
  if (!backdrop || !backdrop.classList.contains("hidden")) return;
  openers.set(id, document.activeElement);
  backdrop.classList.remove("hidden");
  document.body.classList.add("modal-open");
  for (const el of $$(".hud-right, #view-map")) el.inert = true;
  requestAnimationFrame(() => {
    const target = (focus && backdrop.querySelector(focus)) || backdrop.querySelector(FOCUSABLE);
    target?.focus({ preventScroll: true });
  });
  document.dispatchEvent(new CustomEvent("modal:open", { detail: { id } }));
}

export function closeModal(id) {
  const backdrop = document.getElementById(id);
  if (!backdrop || backdrop.classList.contains("hidden")) return;
  backdrop.classList.add("hidden");
  if (!document.querySelector(".modal-backdrop:not(.hidden)")) {
    document.body.classList.remove("modal-open");
    for (const el of $$(".hud-right, #view-map")) el.inert = false;
  }
  const back = openers.get(id);
  openers.delete(id);
  if (back?.isConnected) back.focus({ preventScroll: true });
  document.dispatchEvent(new CustomEvent("modal:close", { detail: { id } }));
}

// Close buttons, a click on the backdrop, Escape, and Tab kept inside the open modal.
export function wireModals() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close-modal]");
    if (btn) return closeModal(btn.dataset.closeModal);
    if (e.target.classList?.contains("modal-backdrop")) closeModal(e.target.id);
  });
  document.addEventListener("keydown", (e) => {
    const open = [...document.querySelectorAll(".modal-backdrop:not(.hidden)")].pop();
    if (!open || document.body.classList.contains("touring")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal(open.id);
      return;
    }
    if (e.key !== "Tab") return;
    const items = $$(FOCUSABLE, open).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

// ---------- the status line ----------

let statusTimer = null;

// One short line over the map, read out politely, gone after `ms`.
export function say(text, ms = 4000) {
  const el = $("#status");
  if (!el) return;
  clearTimeout(statusTimer);
  el.textContent = text;
  el.classList.toggle("hidden", !text);
  if (text && ms) statusTimer = setTimeout(() => el.classList.add("hidden"), ms);
}
