// Singapore's map saved for offline, from the Download button in the Edge Tray (adapted from SG
// Bus Timings' js/map-save.js): every OpenFreeMap vector tile over Singapore from zoom 9 to 14,
// the closest OpenFreeMap goes (MapLibre draws closer in from those), and what the map needs to
// draw them: its styles, sprites, the fonts for its labels, MapLibre itself, and the layers that
// don't change from minute to minute (MRT, planning areas, bus stops, taxi stands).
//
// Within OpenFreeMap's terms for an app's offline download: at most MAX_TILES tiles and
// MAX_BYTES a download, PARALLEL requests at a time. The tiles are counted first, with an
// estimate of their size, and the download can be cancelled; a first one cancelled keeps
// nothing. The service worker fetches and keeps each tile ("map-save-tile" in sw.js) in
// SAVED_CACHE, which nothing trims; Remove deletes them all.
//
// OpenFreeMap's tiles move to a new address every week (its TileJSON names them). The week saved
// is kept with the download; once a newer one is out, Update fetches it, keeping the old tiles
// until each is replaced.
//
// OneMap's and OpenStreetMap's own tiles aren't downloaded: their terms don't allow bulk
// downloads. Offline, the map shows OpenFreeMap's saved tiles whichever base map is picked.

import { getLocale, t } from "../i18n/i18n.js";
import { OFM_TILEJSON, STYLE_DARK, STYLE_LIGHT } from "./map.js";
import { $, escapeHtml, hydrateIcons } from "./ui.js";

const OFM = "https://tiles.openfreemap.org";
// The same names as in sw.js.
const SAVED_CACHE = "sgmap-map-saved";
const VECTOR_CACHE = "sgmap-vector";
const META_KEY = "sgmap.mapSaved";
const MAX_TILES = 3000;
const MAX_BYTES = 50 * 1024 * 1024;
const BYTES_MARGIN = 1024 * 1024;
const PARALLEL = 4;
// Singapore, [south, west, north, east].
const BOX = [1.15, 103.6, 1.48, 104.1];
const MIN_ZOOM = 9;
const MAX_ZOOM = 14;
const GUESS_TILE_BYTES = 40 * 1024;
const GLYPH_RANGES = ["0-255", "256-511", "8192-8447"];
const STYLES = [STYLE_LIGHT, STYLE_DARK];
const MAPLIBRE = ["/vendor/maplibre-5.24.0/maplibre-gl.js", "/vendor/maplibre-5.24.0/maplibre-gl.css"];
const LAYER_DATA = ["/data/rail-stations.json", "/data/rail-tracks.json", "/data/planning-areas.json", "/api/layer/bus-stops", "/api/layer/taxi-stands"];
const RENDER_MS = 150;

let state = null; // { total, done, bytes, sent, failed, cancelled, tooBig, update, starting }
let newer = null;
let message = "";
let estimate = null;
let lastRender = 0;

function meta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "null");
  } catch {
    return null;
  }
}
function setMeta(m) {
  try {
    if (m) localStorage.setItem(META_KEY, JSON.stringify(m));
    else localStorage.removeItem(META_KEY);
  } catch { /* shown as not saved next time; the tiles still serve */ }
}

// ---------- counting (pure, tests/format.test.mjs) ----------

export const tileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
export const tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

export function tilesFor(template, from, to, box = BOX) {
  const out = [];
  const [s, w, n, e] = box;
  for (let z = from; z <= to; z++) {
    for (let x = tileX(w, z); x <= tileX(e, z); x++) {
      for (let y = tileY(n, z); y <= tileY(s, z); y++) out.push(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
    }
  }
  return out;
}

const vectorCount = () => tilesFor("{z}/{x}/{y}", MIN_ZOOM, MAX_ZOOM).length;

async function estimateBytes(count) {
  let each = GUESS_TILE_BYTES;
  try {
    if (await caches.has(VECTOR_CACHE)) {
      const cache = await caches.open(VECTOR_CACHE);
      const keys = (await cache.keys()).slice(-40);
      const sizes = await Promise.all(keys.map(async (k) => (await (await cache.match(k))?.blob())?.size || 0));
      const seen = sizes.filter(Boolean);
      if (seen.length >= 10) each = seen.reduce((a, b) => a + b, 0) / seen.length;
    }
  } catch { /* the guess */ }
  return Math.round(count * each);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const dayOf = (ms) => new Date(ms).toLocaleDateString(getLocale(), { day: "numeric", month: "short", year: "numeric" });

// ---------- fetching ----------

async function thisWeek() {
  const r = await fetch(OFM_TILEJSON, { cache: "no-cache" });
  if (!r.ok) throw new Error(t("save.ofm-replied", { status: r.status }));
  const tj = await r.json();
  const template = tj.tiles?.[0];
  if (!template) throw new Error(t("save.no-tiles"));
  return { template, maxzoom: Math.min(MAX_ZOOM, tj.maxzoom ?? MAX_ZOOM) };
}

async function extrasFor(styles) {
  const urls = new Set([OFM_TILEJSON, ...MAPLIBRE, ...LAYER_DATA]);
  const tiles = new Set();
  for (const style of styles) {
    urls.add(style.url);
    const s = style.json;
    const sprites = typeof s.sprite === "string" ? [s.sprite] : (s.sprite || []).map((x) => x.url);
    for (const sp of sprites) for (const suffix of [".json", ".png", "@2x.json", "@2x.png"]) urls.add(`${sp}${suffix}`);
    const stacks = new Set([["Noto Sans Regular"].join(","), ["Noto Sans Bold"].join(",")]);
    for (const layer of s.layers || []) {
      let font = layer.layout?.["text-font"];
      if (Array.isArray(font) && font[0] === "literal") font = font[1];
      if (Array.isArray(font) && font.length && font.every((f) => typeof f === "string")) stacks.add(font.join(","));
    }
    if (s.glyphs) for (const stack of stacks) for (const range of GLYPH_RANGES) urls.add(s.glyphs.replace("{fontstack}", stack).replace("{range}", range));
    for (const src of Object.values(s.sources || {})) {
      if (src.type === "raster" && src.tiles?.[0]) for (const tl of tilesFor(src.tiles[0], src.maxzoom ?? 6, src.maxzoom ?? 6)) tiles.add(tl);
    }
  }
  return [...[...urls].map((u) => [u, false]), ...[...tiles].map((u) => [u, true])];
}

function saveTile(url) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => resolve(data);
    navigator.serviceWorker.controller.postMessage({ type: "map-save-tile", url }, [channel.port2]);
  });
}

async function download() {
  if (state) return;
  message = "";
  if (!navigator.serviceWorker?.controller) {
    message = t("save.no-worker");
    return render(true);
  }
  if (navigator.onLine === false) {
    message = t("save.offline");
    return render(true);
  }
  const had = meta();
  state = { total: 0, done: 0, bytes: 0, sent: 0, failed: 0, cancelled: false, tooBig: false, update: Boolean(had), starting: true };
  render(true);
  try {
    const week = await thisWeek();
    const styles = await Promise.all(STYLES.map(async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(t("save.ofm-replied", { status: r.status }));
      return { url, json: await r.json() };
    }));
    const vector = tilesFor(week.template, MIN_ZOOM, week.maxzoom);
    const extras = await extrasFor(styles);
    const tileCount = vector.length + extras.filter(([, isTile]) => isTile).length;
    if (tileCount > MAX_TILES) throw new Error(t("save.too-many", { count: tileCount, max: MAX_TILES }));
    Object.assign(state, { total: vector.length + extras.length, starting: false });
    render(true);

    const jobs = [...extras.map(([url]) => ["extra", url]), ...vector.map((url) => ["tile", url])];
    let next = 0;
    const one = async ([kind, url]) => {
      if (kind === "tile") return saveTile(url);
      const r = await fetch(url);
      if (!r.ok) return { ok: false };
      const bytes = (await r.blob()).size;
      // Only what comes from OpenFreeMap counts towards its limit.
      const sent = url.startsWith(OFM) ? Number(r.headers.get("content-length")) || bytes : 0;
      return { ok: true, bytes, sent };
    };
    const worker = async () => {
      while (!state.cancelled && !state.tooBig && next < jobs.length) {
        const job = jobs[next++];
        let r = await one(job).catch(() => ({ ok: false }));
        if (!r.ok && !state.cancelled) r = await one(job).catch(() => ({ ok: false }));
        state.done++;
        if (!r.ok) state.failed++;
        else {
          state.bytes += r.bytes || 0;
          state.sent += r.sent || 0;
        }
        if (state.sent >= MAX_BYTES - BYTES_MARGIN) state.tooBig = true;
        render();
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    const run = state;
    state = null;
    if (run.cancelled) {
      if (!run.update) await caches.delete(SAVED_CACHE);
      message = run.update ? t("save.update-cancelled") : t("save.cancelled");
      return render(true);
    }
    const capped = run.tooBig ? run.total - run.done : 0;
    setMeta({ tiles: week.template, at: Date.now(), bytes: run.bytes, count: vector.length, missing: run.failed, capped });
    newer = null;
    message = capped ? t("save.capped", { size: mb(MAX_BYTES) }) : run.failed ? t("save.some-failed", { failed: run.failed, total: run.total }) : t("save.done");
  } catch (err) {
    const run = state;
    state = null;
    if (run && !run.update) await caches.delete(SAVED_CACHE).catch(() => {});
    message = t("save.failed", { reason: err.message });
  }
  render(true);
}

async function remove() {
  if (state) return;
  await caches.delete(SAVED_CACHE).catch(() => {});
  setMeta(null);
  newer = null;
  message = t("save.removed");
  render(true);
}

async function checkWeek() {
  const m = meta();
  if (!m || navigator.onLine === false) return;
  try {
    const week = await thisWeek();
    newer = week.template !== m.tiles ? week.template : null;
    render(true);
  } catch { /* asked again next time it's opened */ }
}

// ---------- the sheet ----------

function render(now = false) {
  const body = $("#saveBody");
  if (!body || $("#saveModal").classList.contains("hidden")) return;
  if (!now && state && Date.now() - lastRender < RENDER_MS) return;
  lastRender = Date.now();
  const m = meta();
  const say = message ? `<p class="saveMsg" role="status">${escapeHtml(message)}</p>` : "";
  const btn = (action, iconName, text, primary = false) =>
    `<button type="button" class="btn${primary ? " btn-primary" : ""}" data-save="${action}"><span data-icon="${iconName}"></span>${escapeHtml(text)}</button>`;
  if (state) {
    body.innerHTML = state.starting
      ? `<p>${escapeHtml(t("save.counting"))}</p>`
      : `<p>${escapeHtml(t(state.update ? "save.updating" : "save.saving", { done: state.done, total: state.total, size: mb(state.bytes) }))}</p>` +
        `<progress max="${state.total}" value="${state.done}" aria-label="${escapeHtml(t("save.progress"))}"></progress>` +
        `<div class="saveActions">${btn("cancel", "close", t("save.cancel"))}</div>`;
  } else if (m) {
    body.innerHTML = say +
      `<p><b>${escapeHtml(t("save.saved", { date: dayOf(m.at), size: mb(m.bytes) }))}</b></p>` +
      (newer ? `<p class="saveMsg">${escapeHtml(t("save.newer"))}</p>` : "") +
      `<div class="saveActions">` +
      (newer || m.missing ? btn("download", "refresh", newer ? t("save.update") : t("save.retry"), true) : "") +
      btn("remove", "trash", t("save.remove")) +
      `</div>`;
  } else {
    body.innerHTML = say +
      `<p>${escapeHtml(t("save.intro"))}</p>` +
      `<p class="saveMsg">${escapeHtml(t("save.estimate", { count: vectorCount(), size: estimate == null ? "…" : mb(estimate) }))}</p>` +
      `<div class="saveActions">${btn("download", "download", t("save.download"), true)}</div>`;
  }
  hydrateIcons(body);
}

export function openSave() {
  if (!state) message = "";
  render(true);
  if (estimate == null) estimateBytes(vectorCount()).then((b) => { estimate = b; render(true); });
  checkWeek();
}

export function initSave() {
  $("#saveBody").addEventListener("click", (e) => {
    const action = e.target.closest("[data-save]")?.dataset.save;
    if (action === "download") download();
    else if (action === "remove") remove();
    else if (action === "cancel" && state) {
      state.cancelled = true;
      render(true);
    }
  });
}

export const mapSaved = () => Boolean(meta());
