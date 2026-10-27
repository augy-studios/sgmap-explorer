// SG Map Explorer's service worker: the app shell offline, the map's tiles and files kept as
// they're seen, Singapore's map saved whole on request (js/map-save.js), and the layers' last
// replies for when there's no connection.
//
// Bump VERSION on every deploy that changes anything this worker serves. The browser compares
// this file byte for byte, so an unchanged VERSION means nobody is offered the update bar
// (js/sw-update.js) and the old cache keeps answering.
const VERSION = "v3";
const CACHE = `sgmap-${VERSION}`;

const ASSETS = [
  "/",
  "/style.css",
  "/js/app.js",
  "/js/theme.js",
  "/js/icons.js",
  "/js/ui.js",
  "/js/tray.js",
  "/js/map.js",
  "/js/layers.js",
  "/js/format.js",
  "/js/card.js",
  "/js/map-save.js",
  "/js/tour.js",
  "/js/sw-update.js",
  // The i18n runtime and every language (docs/i18n-retrofit-spec.md 10.3).
  "/i18n/boot.js",
  "/i18n/i18n.js",
  "/i18n/locales.js",
  "/i18n/switcher.js",
  "/i18n/en.json",
  "/manifest.json",
  "/favicon.ico",
  "/ESG-192.png",
  "/ESG-512.png",
  "/ESG-main.png",
];

// Cached on first use so the Jua font still renders offline.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// None of these are versioned with the site, so a deploy doesn't throw them away:
// - MAP_CACHE: MapLibre (its folder is named for its version, so it never changes), and
//   OpenFreeMap's fonts and sprites, kept as they are; its styles and TileJSON (which names this
//   week's tiles) shown from the cache and fetched again behind, so the map opens offline.
// - VECTOR_CACHE: OpenFreeMap's vector tiles as they're seen. Each week's are at their own
//   address, so a tile never changes; capped at VECTOR_MAX, the oldest going first.
// - TILE_CACHE: OneMap's and OpenStreetMap's picture tiles as they're seen, capped at TILE_MAX,
//   and fetched again behind when older than TILE_REFRESH_MS.
// - SAVED_MAP_CACHE: Singapore's map saved for offline (js/map-save.js), never trimmed. Each tile
//   is kept under its zoom and place without the week (savedKey), with the address it came from
//   in x-saved-from: served as it is for that week, and for any week when the network can't be
//   reached.
// - DATA_CACHE: the layers' last replies (/api/layer/...) and the vendored data (/data/...).
const MAP_CACHE = "sgmap-map";
const VECTOR_CACHE = "sgmap-vector";
const VECTOR_MAX = 1500;
const TILE_CACHE = "sgmap-tiles";
const TILE_MAX = 2000;
const TILE_REFRESH_MS = 14 * 24 * 3600 * 1000;
const SAVED_MAP_CACHE = "sgmap-map-saved";
const DATA_CACHE = "sgmap-data";
const KEEP = [CACHE, MAP_CACHE, VECTOR_CACHE, TILE_CACHE, SAVED_MAP_CACHE, DATA_CACHE];

const MAPLIBRE = ["/vendor/maplibre-5.24.0/maplibre-gl.js", "/vendor/maplibre-5.24.0/maplibre-gl.css"];
const OFM_HOST = "tiles.openfreemap.org";
const isVectorTile = (url) => url.hostname === OFM_HOST && /\.pbf$/.test(url.pathname) && !url.pathname.startsWith("/fonts/");
const isOfmFresh = (url) => url.hostname === OFM_HOST && (url.pathname.startsWith("/styles/") || /^\/planet\/?$/.test(url.pathname));
const isRasterTile = (url) => url.hostname === "tile.openstreetmap.org" || (url.hostname === "www.onemap.gov.sg" && url.pathname.startsWith("/maps/tiles/"));
const savedKey = (url) => url.replace(/^(https:\/\/[^/]+\/planet\/)[^/]+\//, "$1saved/");
// Layers that change a few times a year: the last copy at once, a fresh one fetched behind it.
const SLOW_LAYERS = ["/api/layer/bus-stops", "/api/layer/taxi-stands", "/api/layer/bicycle-parking", "/api/layer/onemap-themes", "/api/layer/onemap"];

// No skipWaiting() here: a new worker installs and then waits until somebody presses Reload on
// the update bar (js/sw-update.js, docs/update-bar-spec.md).
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      // cache: "reload" so the new version is precached from the network, not the HTTP cache.
      caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })))),
      caches.open(MAP_CACHE).then(async (cache) => {
        for (const url of MAPLIBRE) if (!(await cache.match(url))) await cache.add(url).catch(() => {});
      }),
    ])
  );
});

// No clients.claim() here either, for the same reason.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))));
});

self.addEventListener("message", (event) => {
  const type = typeof event.data === "string" ? event.data : event.data?.type;

  // The only place either of these is ever called.
  if (type === "skip-waiting") {
    event.waitUntil(self.skipWaiting().then(() => self.clients.claim()));
  }

  // One tile of the map being saved for offline (js/map-save.js), answered on the port sent.
  if (type === "map-save-tile") {
    event.waitUntil(saveMapTile(event.data.url).catch(() => ({ ok: false })).then((r) => event.ports[0]?.postMessage(r)));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (FONT_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(request, CACHE));
    else if (isRasterTile(url)) event.respondWith(rasterTile(event, request));
    else if (isVectorTile(url)) event.respondWith(vectorTile(request));
    else if (isOfmFresh(url)) event.respondWith(staleWhileRevalidate(event, request, MAP_CACHE, { fresh: request.cache === "no-cache" }));
    else if (url.hostname === OFM_HOST) event.respondWith(cacheFirst(request, MAP_CACHE));
    // Analytics, ads and the traffic cameras' pictures go straight to the network.
    return;
  }

  if (url.pathname.startsWith("/vendor/maplibre-")) {
    event.respondWith(cacheFirst(request, MAP_CACHE));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    // The radar picture is big and only worth it fresh; the cron is never the browser's.
    if (!url.pathname.startsWith("/api/layer/")) return;
    if (SLOW_LAYERS.includes(url.pathname)) event.respondWith(staleWhileRevalidate(event, request, DATA_CACHE));
    // Live layers: the network first, and the last reply only when there's none. Its `at` says
    // how old it is, which the map shows.
    else event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(staleWhileRevalidate(event, request, DATA_CACHE));
    return;
  }

  // The app shell from this version's cache, so a page never mixes files from two deploys.
  // Offline navigations to anything uncached get the app itself.
  event.respondWith(cacheFirst(request, CACHE, request.mode === "navigate" ? "/" : null));
});

async function cacheFirst(request, name, fallbackUrl = null) {
  const cache = await caches.open(name);
  const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const fallback = fallbackUrl && (await caches.match(fallbackUrl, { cacheName: CACHE }));
    if (fallback) return fallback;
    throw err;
  }
}

// The last copy straight away and a fresh one fetched behind it for next time; with `fresh`
// (asked for with cache: "no-cache"), the network first and the copy only if that fails.
async function staleWhileRevalidate(event, request, name, { fresh = false } = {}) {
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (!cached) return network;
  if (fresh) return network.catch(() => cached);
  event.waitUntil(network.catch(() => {}));
  return cached;
}

async function networkFirst(request, name) {
  const cache = await caches.open(name);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "You appear to be offline." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

// ---------- the map's tiles ----------

let rasterPuts = 0;
async function rasterTile(event, request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  const fresh = async () => {
    const res = await fetch(request);
    // Only what can be read: an opaque answer would count as megabytes against storage.
    if (res.ok && res.type !== "opaque") {
      await cache.put(request, res.clone());
      if (++rasterPuts % 50 === 0) trim(cache, TILE_MAX);
    }
    return res;
  };
  if (hit) {
    const age = Date.now() - Date.parse(hit.headers.get("date") || "");
    if (!(age < TILE_REFRESH_MS)) event.waitUntil(fresh().catch(() => {}));
    return hit;
  }
  return fresh();
}

// The oldest first: Cache Storage lists its keys in the order they went in.
async function trim(cache, max) {
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

let vectorPuts = 0;
async function vectorTile(request) {
  const cache = await caches.open(VECTOR_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  // The map saved for offline: this week's tile as it is, another week's only if the network
  // can't give this one.
  const saved = await caches.match(savedKey(request.url), { cacheName: SAVED_MAP_CACHE });
  if (saved && saved.headers.get("x-saved-from") === request.url) return saved;
  let res;
  try {
    res = await fetch(request);
  } catch (err) {
    if (saved) return saved;
    throw err;
  }
  if (res.ok) {
    await cache.put(request, res.clone());
    if (++vectorPuts % 50 === 0) trim(cache, VECTOR_MAX);
  } else if (saved) {
    return saved;
  }
  return res;
}

// A tile of the map being saved: { ok, bytes, sent }, `sent` 0 when this week's was kept already.
async function saveMapTile(url) {
  const u = new URL(url);
  if (!isVectorTile(u)) return { ok: false };
  const cache = await caches.open(SAVED_MAP_CACHE);
  const key = savedKey(url);
  const kept = await cache.match(key);
  if (kept && kept.headers.get("x-saved-from") === url) return { ok: true, bytes: Number(kept.headers.get("x-saved-bytes")) || 0, sent: 0 };
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) return { ok: false, status: res.status };
  const body = await res.blob();
  await cache.put(key, new Response(body, {
    headers: { "content-type": res.headers.get("content-type") || "application/x-protobuf", "x-saved-from": url, "x-saved-bytes": String(body.size), date: new Date().toUTCString() },
  }));
  return { ok: true, bytes: body.size, sent: Number(res.headers.get("content-length")) || body.size };
}
