// The language switcher (docs/i18n-retrofit-spec.md 7 and 8): a button in the Edge Tray, the
// globe and the language's code, and a modal listing every language by its own name. Picking
// one switches the page in place; Escape, Close or the backdrop leave it as it was.

import { getLocale, getLocales, onChange, setLocale, t, applyTo } from "./i18n.js";
import { icon } from "../js/icons.js";
import { closeModal, openModal } from "../js/ui.js";

const MODAL_ID = "langModal";

function renderButton(btn) {
  const entry = getLocales().find((l) => l.code === getLocale());
  btn.innerHTML = `${icon("globe")}<span class="langCode">${entry ? entry.code.toUpperCase() : ""}</span>`;
  const label = t("a11y.language-switcher", { name: entry?.name || "" });
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

function buildModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop hidden";
  backdrop.id = MODAL_ID;
  backdrop.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true" aria-labelledby="lang-title">
      <div class="modal-head">
        <h2 id="lang-title" data-i18n="language.modal.title">Choose a language</h2>
        <button class="icon-btn small" type="button" data-close-modal="${MODAL_ID}" data-i18n-attr="aria-label:common.close, title:common.close">${icon("close")}</button>
      </div>
      <ul class="langList" role="listbox" aria-labelledby="lang-title"></ul>
    </div>`;
  document.body.appendChild(backdrop);
  applyTo(backdrop);
  return backdrop;
}

function renderList(list) {
  const active = getLocale();
  list.innerHTML = "";
  for (const l of getLocales()) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.locale = l.code;
    li.lang = l.code;
    li.dir = l.dir;
    li.tabIndex = l.code === active ? 0 : -1;
    li.setAttribute("aria-selected", String(l.code === active));
    li.innerHTML = `<span>${l.name.replace(/[&<>]/g, "")}</span>${l.code === active ? icon("check") : ""}`;
    list.appendChild(li);
  }
}

export function mountSwitcher(btn) {
  if (!btn) return;
  const backdrop = buildModal();
  const list = backdrop.querySelector(".langList");
  renderButton(btn);
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");

  const choose = (code) => {
    closeModal(MODAL_ID);
    if (code && code !== getLocale()) setLocale(code);
  };

  btn.addEventListener("click", () => {
    renderList(list);
    btn.setAttribute("aria-expanded", "true");
    openModal(MODAL_ID, { focus: '[aria-selected="true"]' });
  });
  document.addEventListener("modal:close", (e) => {
    if (e.detail.id === MODAL_ID) btn.setAttribute("aria-expanded", "false");
  });

  list.addEventListener("click", (e) => {
    const row = e.target.closest("[data-locale]");
    if (row) choose(row.dataset.locale);
  });
  list.addEventListener("keydown", (e) => {
    const rows = [...list.querySelectorAll("[data-locale]")];
    const i = rows.indexOf(document.activeElement);
    let next = null;
    if (e.key === "ArrowDown") next = Math.min(rows.length - 1, i + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (rows[i]) choose(rows[i].dataset.locale);
      return;
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // The next language starting with the letter typed.
      const k = e.key.toLowerCase();
      const order = [...rows.slice(i + 1), ...rows.slice(0, i + 1)];
      const hit = order.find((r) => r.textContent.trim().toLowerCase().startsWith(k));
      if (hit) next = rows.indexOf(hit);
    }
    if (next == null) return;
    e.preventDefault();
    rows.forEach((r, n) => (r.tabIndex = n === next ? 0 : -1));
    rows[next].focus();
  });

  onChange(() => {
    renderButton(btn);
    applyTo(backdrop);
  });
}
