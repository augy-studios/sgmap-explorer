// The card at the bottom of the map: what a tapped marker is, in words. Not modal, so the map
// stays in reach; Escape or the close button put it away. Every value goes in as text, never as
// markup: the names come from LTA, NEA and OneMap.

import { $, escapeHtml, hydrateIcons } from "./ui.js";

let lastFocus = null;

// The card's height as --card-h while it's up on a phone, so the map's buttons and its
// attribution sit above it rather than under it. Side by side on a wide screen, nothing moves.
function makeRoom() {
  const card = $("#card");
  const up = !card.classList.contains("hidden") && innerWidth < 640;
  document.documentElement.style.setProperty("--card-h", up ? `${card.offsetHeight + 10}px` : "0px");
}
const sizer = typeof ResizeObserver === "function" ? new ResizeObserver(makeRoom) : null;

// { icon, colour, title, subtitle, rows: [[label, value]], note, image: { src, alt }, link:
// { href, text }, sections: [{ title, rows }], at }
export function showCard(c) {
  const card = $("#card");
  const body = $("#cardBody");
  const rows = (list) =>
    list?.length
      ? `<dl class="cardRows">${list.filter((r) => r && r[1] !== "" && r[1] != null).map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`
      : "";
  body.innerHTML =
    `<div class="cardHead">` +
    (c.icon ? `<span class="cardBadge" style="--badge:${escapeHtml(c.colour || "")}" data-icon="${escapeHtml(c.icon)}"></span>` : "") +
    `<div><h2 id="cardTitle">${escapeHtml(c.title || "")}</h2>${c.subtitle ? `<p class="cardSub">${escapeHtml(c.subtitle)}</p>` : ""}</div></div>` +
    (c.image ? `<img class="cardImage" src="${escapeHtml(c.image.src)}" alt="${escapeHtml(c.image.alt || "")}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : "") +
    rows(c.rows) +
    (c.sections || [])
      .map((s) => `<details class="cardSection"${s.open ? " open" : ""}><summary>${escapeHtml(s.title)}</summary>${rows(s.rows)}${s.note ? `<p class="cardNote">${escapeHtml(s.note)}</p>` : ""}</details>`)
      .join("") +
    (c.note ? `<p class="cardNote">${escapeHtml(c.note)}</p>` : "") +
    (c.link ? `<p><a class="cardLink" href="${escapeHtml(c.link.href)}" target="_blank" rel="noopener">${escapeHtml(c.link.text)}</a></p>` : "") +
    (c.at ? `<p class="cardAt">${escapeHtml(c.at)}</p>` : "");
  hydrateIcons(body);
  const wasHidden = card.classList.contains("hidden");
  card.classList.remove("hidden");
  if (wasHidden) lastFocus = document.activeElement;
  makeRoom();
  // Focus moves to it only from the keyboard: a tap on the map keeps the map in hand.
  if (c.focus) $("#cardClose").focus({ preventScroll: true });
}

export function hideCard() {
  const card = $("#card");
  if (card.classList.contains("hidden")) return;
  card.classList.add("hidden");
  makeRoom();
  if (card.contains(document.activeElement) && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
}

export function initCard() {
  sizer?.observe($("#card"));
  addEventListener("resize", makeRoom);
  $("#cardClose").addEventListener("click", hideCard);
  $("#card").addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCard();
  });
}
