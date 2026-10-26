// The page tour (docs/page-tour-spec.md): a few steps over the map the first time it opens, each
// a spotlight on the real thing with a chalk arrow to it and one line saying what it does. Next
// moves on, Skip ends it, and Settings' Show me around shows it again.
//
// The app has one page, the map, so its tour is also the welcome. Its steps light the Edge Tray's
// buttons, so the tray opens first if it was left closed. A step whose thing isn't on screen is
// left out.

import { t } from "../i18n/i18n.js";
import { setTray, trayOpen } from "./tray.js";

const WELCOME_KEY = "tour.welcome";
const PAGES_KEY = "tour.pages";
const PAD = 8;
const START = "map";

// Each page's steps: `el` a selector (alternatives allowed), `text` a key in en.json.
const TOURS = {
  map: {
    labelKey: "tour.map.label",
    steps: [
      { el: "#map", textKey: "tour.map.map" },
      { el: "#trayLayers", textKey: "tour.map.layers" },
      { el: "#trayQuick", textKey: "tour.map.quick" },
      { el: "#compassBtn", textKey: "tour.map.compass" },
      { el: "#pitchBtn", textKey: "tour.map.pitch" },
      { el: "#traySave", textKey: "tour.map.save" },
      { el: "#settingsBtn", textKey: "tour.map.settings" },
    ],
  },
};

// The app's page switching, as the tour needs it (6): one page, always on show.
const pages = { active: () => START, open: () => {} };

let steps = [];
let at = 0;
let root = null; // the layer, or `true` while a tour is getting ready
let page = null;
let began = null;

function seen(id) {
  try {
    if (id === START) return localStorage.getItem(WELCOME_KEY) === "done";
    return JSON.parse(localStorage.getItem(PAGES_KEY) || "[]").includes(id);
  } catch {
    return true;
  }
}
function markSeen(id) {
  try {
    if (id === START) return localStorage.setItem(WELCOME_KEY, "done");
    const list = JSON.parse(localStorage.getItem(PAGES_KEY) || "[]");
    if (!list.includes(id)) localStorage.setItem(PAGES_KEY, JSON.stringify([...list, id]));
  } catch { /* shown again next time */ }
}

function visible(el) {
  if (!el || el.closest("[hidden]") || el.closest(".hidden")) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}
const target = (s) => [...document.querySelectorAll(s.el)].find(visible) || null;

function build() {
  root = document.createElement("div");
  root.className = "tour";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "tourText");
  root.innerHTML =
    '<div class="tourHole"></div>' +
    '<svg class="tourArrow" aria-hidden="true"><defs><filter id="tourChalk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/></filter></defs>' +
    '<path class="tourLine" filter="url(#tourChalk)"/><path class="tourHead" filter="url(#tourChalk)"/></svg>' +
    `<button class="tourSkip" type="button"></button>` +
    '<div class="tourCard"><p id="tourText" class="tourText" aria-live="polite"></p>' +
    '<div class="tourFoot"><span class="tourDots" aria-hidden="true"></span><button class="tourNext" type="button"></button></div></div>';
  root.querySelector(".tourSkip").textContent = t("tour.skip");
  document.body.appendChild(root);
  root.querySelector(".tourSkip").addEventListener("click", end);
  root.querySelector(".tourNext").addEventListener("click", next);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") end();
    if (e.key === "ArrowRight") next();
  });
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
}

function show(i) {
  at = i;
  const el = steps[i].target;
  const tall = el.getBoundingClientRect().height > innerHeight * 0.6;
  el.scrollIntoView({ block: tall ? "start" : "center", behavior: "instant" });
  root.querySelector(".tourText").textContent = t(steps[i].textKey);
  root.querySelector(".tourDots").innerHTML = steps.map((_, n) => `<span${n === i ? ' class="on"' : ""}></span>`).join("");
  root.querySelector(".tourNext").textContent = i === steps.length - 1 ? t("tour.done") : t("tour.next");
  requestAnimationFrame(place);
  root.querySelector(".tourNext").focus({ preventScroll: true });
}

// The hole, the card on the side with room, lined up with the element, and the arrow between
// them, all of it on screen (3).
const M = 12;
const EDGE = 20;
const GAP_MIN = 36;
const GAP_MAX = 70;
const CARD_MIN = 220;
const clamp = (lo, v, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

function place() {
  if (!root || root === true) return;
  const el = steps[at]?.target;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const vw = innerWidth;
  const vh = innerHeight;
  const hole = root.querySelector(".tourHole");
  Object.assign(hole.style, {
    left: `${r.left - PAD}px`, top: `${r.top - PAD}px`,
    width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px`,
  });

  const v = { left: Math.max(r.left, 0), right: Math.min(r.right, vw), top: Math.max(r.top, 0), bottom: Math.min(r.bottom, vh) };
  const card = root.querySelector(".tourCard");
  card.classList.remove("solid");
  card.style.width = "";
  let cw = card.offsetWidth;
  let ch = card.offsetHeight;
  const room = { below: vh - v.bottom - PAD - M, above: v.top - PAD - M, right: vw - v.right - PAD - M, left: v.left - PAD - M };
  let side = null;
  if (Math.max(room.below, room.above) >= ch + GAP_MIN) side = room.below >= room.above ? "below" : "above";
  else {
    const s = room.right >= room.left ? "right" : "left";
    const fit = room[s] - GAP_MIN;
    if (fit >= Math.min(cw, CARD_MIN)) {
      if (fit < cw) {
        card.style.width = `${fit}px`;
        cw = card.offsetWidth;
        ch = card.offsetHeight;
      }
      if (ch <= vh - M * 2) side = s;
      else card.style.width = "";
    }
  }

  const line = root.querySelector(".tourLine");
  const head = root.querySelector(".tourHead");
  let left;
  let top;
  if (!side) {
    card.classList.add("solid");
    cw = card.offsetWidth;
    ch = card.offsetHeight;
    left = (vw - cw) / 2;
    top = (v.top + v.bottom) / 2 > vh / 2 ? M : vh - ch - M;
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
    line.setAttribute("d", "");
    head.setAttribute("d", "");
    return;
  }

  const midX = (v.left + v.right) / 2;
  const midY = (v.top + v.bottom) / 2;
  let sx;
  let sy;
  let tx;
  let ty;
  if (side === "below" || side === "above") {
    const gap = clamp(GAP_MIN, room[side] - ch, GAP_MAX);
    left = clamp(M, midX - cw / 2, vw - cw - M);
    top = side === "below" ? v.bottom + PAD + gap : v.top - PAD - gap - ch;
    top = clamp(M, top, vh - ch - M);
    tx = clamp(v.left + 12, midX, v.right - 12);
    ty = side === "below" ? v.bottom + PAD + 4 : v.top - PAD - 4;
    sx = clamp(left + 24, tx, left + cw - 24);
    sy = side === "below" ? top - 6 : top + ch + 6;
  } else {
    const gap = clamp(GAP_MIN, room[side] - cw, GAP_MAX);
    left = side === "right" ? v.right + PAD + gap : v.left - PAD - gap - cw;
    left = clamp(M, left, vw - cw - M);
    top = clamp(M, midY - ch / 2, vh - ch - M);
    tx = side === "right" ? v.right + PAD + 4 : v.left - PAD - 4;
    ty = clamp(v.top + 12, midY, v.bottom - 12);
    sx = side === "right" ? left - 6 : left + cw + 6;
    sy = clamp(top + 16, ty, top + ch - 16);
  }
  Object.assign(card.style, { left: `${left}px`, top: `${top}px` });

  const inX = (x) => clamp(EDGE, x, vw - EDGE);
  const inY = (y) => clamp(EDGE, y, vh - EDGE);
  tx = inX(tx); ty = inY(ty); sx = inX(sx); sy = inY(sy);
  const dx = tx - sx;
  const dy = ty - sy;
  const mx = inX((sx + tx) / 2 - dy * 0.2);
  const my = inY((sy + ty) / 2 + dx * 0.2);

  root.querySelector(".tourArrow").setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  line.setAttribute("d", `M${sx},${sy} Q${mx},${my} ${tx},${ty}`);
  line.style.setProperty("--len", Math.ceil(line.getTotalLength()) + 10);
  const ang = Math.atan2(ty - my, tx - mx);
  const a1 = ang + Math.PI * 0.8;
  const a2 = ang - Math.PI * 0.8;
  const len = 14;
  head.setAttribute("d", `M${tx + Math.cos(a1) * len},${ty + Math.sin(a1) * len} L${tx},${ty} L${tx + Math.cos(a2) * len},${ty + Math.sin(a2) * len}`);
}

function next() {
  if (at < steps.length - 1) show(at + 1);
  else end();
}

function end() {
  if (page) markSeen(page);
  removeEventListener("resize", place);
  removeEventListener("scroll", place, true);
  if (root && root !== true) root.remove();
  root = null;
  page = null;
  document.body.classList.remove("touring");
  const back = began;
  began = null;
  if (back && pages.active() !== back) pages.open(back);
}

export function start(id = START) {
  if (root || !TOURS[id]) return;
  const from = pages.active();
  if (from !== id) pages.open(id);
  // The tray's buttons are most of the steps.
  if (!trayOpen()) setTray(true, { save: false });
  root = true;
  // After the tray has slid in.
  setTimeout(() => {
    root = null;
    steps = TOURS[id].steps.map((s) => ({ ...s, target: target(s) })).filter((s) => s.target);
    if (!steps.length) {
      markSeen(id);
      return;
    }
    page = id;
    began = from;
    document.body.classList.add("touring");
    build();
    show(0);
  }, 420);
}

// The welcome, once the map has drawn, unless a link opened something or a window is open.
export function initTour({ ready = () => true } = {}) {
  if (location.hash.length > 1 || location.search) return;
  if (seen(START)) return;
  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    if (!ready() && tries <= 16) return;
    clearInterval(wait);
    if (!document.body.classList.contains("modal-open")) start(START);
  }, 500);
}

// Settings' Show me around: a button per tour.
export function pickers() {
  return Object.entries(TOURS)
    .map(([id, tour]) => `<button class="pill" type="button" data-tour="${id}">${t(tour.labelKey)}</button>`)
    .join("");
}
