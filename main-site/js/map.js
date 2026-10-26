// The map: MapLibre GL (vendor/maplibre-5.24.0) over Singapore, with the buildings in 3D.
//
// - Base maps (Settings): OpenFreeMap's vector map, its Liberty style in light mode and its Dark
//   style in dark mode with Liberty's 3D buildings added (Dark has none); OneMap's own tiles
//   (Default by day, Night in dark mode); or OpenStreetMap's. Over OneMap and OpenStreetMap the
//   3D buildings still come from OpenFreeMap's vector tiles.
// - If OpenFreeMap's style doesn't come, or its tiles keep failing while online, the map changes
//   to OpenStreetMap's for the rest of the page view (as SG Bus Timings' Explorer does).
// - Gestures: two fingers dragged up or down tilt the map (MapLibre's touchPitch), two fingers
//   twisted turn it, and the 3D button tilts it to 60 degrees and back.
// - The compass button turns the map with the phone, so the way it points is up, centred on you
//   until you drag the map away. iOS asks before a page can read the compass, from the tap.
// - Whatever js/layers.js draws goes over the style, put back each time the style changes
//   (onStyle()).

import { onChange, t } from "../i18n/i18n.js";
import { $, say } from "./ui.js";

const OFM = "https://tiles.openfreemap.org";
export const STYLE_LIGHT = `${OFM}/styles/liberty`;
export const STYLE_DARK = `${OFM}/styles/dark`;
export const OFM_TILEJSON = `${OFM}/planet`;
const GLYPHS = `${OFM}/fonts/{fontstack}/{range}.pbf`;
// OpenFreeMap's fonts, which every base map here labels with.
export const FONT = ["Noto Sans Regular"];
export const FONT_BOLD = ["Noto Sans Bold"];

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const ONEMAP_TILES = (style) => `https://www.onemap.gov.sg/maps/tiles/${style}/{z}/{x}/{y}.png`;
const ONEMAP_ATTR = '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>';

export const BASEMAPS = ["openfreemap", "onemap", "osm"];
const BASEMAP_KEY = "sgmap.basemap";
const VIEW_KEY = "sgmap.view";

// Singapore and a little round it, [[west, south], [east, north]].
const BOUNDS = [[103.35, 0.98], [104.4, 1.72]];
const HOME = { center: [103.8198, 1.3521], zoom: 10.6 };
const STYLE_WAIT_MS = 10_000;
const FAILS_TO_FALL_BACK = 6;
const TILT = 60;
const COMPASS_FRESH_MS = 3000;
const SMOOTH = 0.25;

let map = null;
let fallen = false;
let styled = false;
const styleHooks = new Set();

export const isDark = () => document.documentElement.getAttribute("data-mode") === "dark";
export const getMap = () => map;
export const styleReady = () => styled;

function storedBasemap() {
  try {
    const v = localStorage.getItem(BASEMAP_KEY);
    return BASEMAPS.includes(v) ? v : "openfreemap";
  } catch {
    return "openfreemap";
  }
}
let basemap = storedBasemap();
export const getBasemap = () => (fallen && basemap === "openfreemap" ? "osm" : basemap);

// ---------- styles ----------

const buildings3d = (dark) => ({
  id: "building-3d",
  type: "fill-extrusion",
  source: "openmaptiles",
  "source-layer": "building",
  minzoom: 14,
  paint: {
    "fill-extrusion-color": dark ? "hsl(240,4%,18%)" : "hsl(35,10%,86%)",
    "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
    "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
    "fill-extrusion-opacity": dark ? 0.85 : 0.75,
  },
});

// OpenFreeMap's styles: Liberty has its own 3D buildings (a building with no height counts as
// flat, rather than a warning); Dark gets them added above its flat ones.
function addBuildings() {
  if (!map.getSource("openmaptiles")) return;
  if (map.getLayer("building-3d")) {
    map.setPaintProperty("building-3d", "fill-extrusion-height", ["coalesce", ["get", "render_height"], 0]);
    map.setPaintProperty("building-3d", "fill-extrusion-base", ["coalesce", ["get", "render_min_height"], 0]);
    return;
  }
  const layers = map.getStyle()?.layers || [];
  const at = layers.findIndex((l) => l["source-layer"] === "building");
  map.addLayer(buildings3d(isDark()), at === -1 ? undefined : layers[at + 1]?.id);
}

// OneMap's or OpenStreetMap's tiles as a style, with OpenFreeMap's buildings over them in 3D.
function rasterStyle(kind) {
  const dark = isDark();
  const base = kind === "onemap"
    ? { type: "raster", tiles: [ONEMAP_TILES(dark ? "Night" : "Default")], tileSize: 256, minzoom: 11, maxzoom: 19, attribution: ONEMAP_ATTR }
    : { type: "raster", tiles: [OSM_TILES], tileSize: 256, maxzoom: 19, attribution: OSM_ATTR };
  // OpenStreetMap's own tiles turned dark, light for dark with the colours kept.
  const paint = kind === "osm" && dark ? { "raster-brightness-min": 0.9, "raster-brightness-max": 0.1, "raster-hue-rotate": 180, "raster-contrast": -0.1 } : {};
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { base, openmaptiles: { type: "vector", url: OFM_TILEJSON } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": dark ? "#1a1e1c" : "#e9ede9" } },
      { id: "base", type: "raster", source: "base", paint },
      buildings3d(dark),
    ],
  };
}

function styleFor() {
  // Offline, OpenFreeMap's map, which the Download button saves; OneMap's and OpenStreetMap's
  // tiles can't be saved in bulk.
  const kind = navigator.onLine === false ? "openfreemap" : getBasemap();
  if (kind === "openfreemap") return isDark() ? STYLE_DARK : STYLE_LIGHT;
  return rasterStyle(kind);
}

function applyStyle() {
  styled = false;
  map.setStyle(styleFor(), { diff: false });
  // OneMap's tiles start at zoom 11.
  map.setMinZoom(getBasemap() === "onemap" ? 10 : 9.5);
}

export function setBasemap(kind) {
  if (!BASEMAPS.includes(kind) || kind === basemap) return;
  basemap = kind;
  fallen = false;
  try {
    localStorage.setItem(BASEMAP_KEY, kind);
  } catch { /* this page view only */ }
  applyStyle();
}

// `fn(map)` once the style is in, and again every time it changes.
export function onStyle(fn) {
  styleHooks.add(fn);
  if (styled) fn(map);
}

function fallBack(why) {
  if (fallen || basemap !== "openfreemap") return;
  fallen = true;
  console.warn("OpenFreeMap not answering, OpenStreetMap instead:", why);
  applyStyle();
}

// ---------- the view, kept for next time ----------

function storedView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    if (v && Array.isArray(v.c) && Number.isFinite(v.z)) return { center: v.c, zoom: v.z, bearing: v.b || 0, pitch: v.p || 0 };
  } catch { /* the whole island */ }
  return null;
}

function keepView() {
  try {
    const c = map.getCenter();
    localStorage.setItem(VIEW_KEY, JSON.stringify({ c: [+c.lng.toFixed(5), +c.lat.toFixed(5)], z: +map.getZoom().toFixed(2), b: +map.getBearing().toFixed(1), p: +map.getPitch().toFixed(1) }));
  } catch { /* not kept */ }
}

// ---------- you, on the map ----------

let here = null; // { lng, lat, accuracy }
let watchId = null;
let following = false;
let firstFix = null;

const ME_SOURCE = "me";

function meData() {
  const features = [];
  if (here) {
    // The accuracy as a disc on the ground, 48 sides.
    const ky = 110540;
    const kx = 111320 * Math.cos((here.lat * Math.PI) / 180);
    const m = Math.min(here.accuracy || 0, 2000);
    const ring = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      ring.push([here.lng + (Math.sin(a) * m) / kx, here.lat + (Math.cos(a) * m) / ky]);
    }
    features.push({ type: "Feature", properties: { kind: "accuracy" }, geometry: { type: "Polygon", coordinates: [ring] } });
    features.push({ type: "Feature", properties: { kind: "dot" }, geometry: { type: "Point", coordinates: [here.lng, here.lat] } });
  }
  return { type: "FeatureCollection", features };
}

function addMe() {
  if (!map.getSource(ME_SOURCE)) map.addSource(ME_SOURCE, { type: "geojson", data: meData() });
  if (!map.getLayer("me-accuracy")) {
    map.addLayer({ id: "me-accuracy", type: "fill", source: ME_SOURCE, filter: ["==", ["get", "kind"], "accuracy"], paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 } });
  }
  if (!map.getLayer("me-dot")) {
    map.addLayer({
      id: "me-dot", type: "circle", source: ME_SOURCE, filter: ["==", ["get", "kind"], "dot"],
      paint: { "circle-radius": 7, "circle-color": "#1a73e8", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
    });
  }
}

// Kept on top: called after js/layers.js puts its layers back.
export function raiseMe() {
  for (const id of ["me-accuracy", "me-dot"]) if (map.getLayer(id)) map.moveLayer(id);
}

function onFix(pos) {
  const c = pos.coords;
  here = { lng: c.longitude, lat: c.latitude, accuracy: c.accuracy };
  map.getSource(ME_SOURCE)?.setData(meData());
  if (firstFix) {
    const inSg = c.latitude > BOUNDS[0][1] && c.latitude < BOUNDS[1][1] && c.longitude > BOUNDS[0][0] && c.longitude < BOUNDS[1][0];
    if (!inSg) say(t("locate.outside"));
    else map.easeTo({ center: [here.lng, here.lat], zoom: Math.max(map.getZoom(), 15.5), duration: 600 });
    firstFix = null;
  } else if (following && compassOn) {
    applyTurn();
  }
}

function onFixError(err) {
  firstFix = null;
  say(err?.code === 1 ? t("locate.denied") : t("locate.failed"));
  $("#locateBtn")?.setAttribute("aria-pressed", "false");
  stopWatching();
}

function stopWatching() {
  if (watchId != null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
}

export function locate() {
  if (!navigator.geolocation) return say(t("locate.failed"));
  $("#locateBtn")?.setAttribute("aria-pressed", "true");
  if (here) map.easeTo({ center: [here.lng, here.lat], zoom: Math.max(map.getZoom(), 15.5), duration: 600 });
  else firstFix = true;
  following = true;
  if (watchId == null) watchId = navigator.geolocation.watchPosition(onFix, onFixError, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 });
}

// ---------- turned with the way you face ----------

let compassOn = false;
let facing = null; // the compass's smoothed heading, degrees from north
let compassAt = 0;
let turned = 0; // the bearing on show, unwrapped, so 359 to 1 turns 2 degrees, not 358
let turnFrame = null;
let compassNote = null;

function onOrient(e) {
  let deg = null;
  if (Number.isFinite(e.webkitCompassHeading)) deg = e.webkitCompassHeading;
  else if ((e.absolute || e.type === "deviceorientationabsolute") && Number.isFinite(e.alpha)) deg = 360 - e.alpha;
  if (deg == null) return;
  // The way the top of the screen points, held sideways too.
  deg = (deg + (screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
  facing = facing == null ? deg : (facing + ((((deg - facing + 540) % 360) - 180) * SMOOTH) + 360) % 360;
  compassAt = Date.now();
  if (!turnFrame) turnFrame = requestAnimationFrame(applyTurn);
}

function applyTurn() {
  turnFrame = null;
  if (!compassOn || facing == null || Date.now() - compassAt > COMPASS_FRESH_MS) return;
  turned += ((((facing - turned) % 360) + 540) % 360) - 180;
  map.jumpTo({ bearing: turned, ...(following && here && { center: [here.lng, here.lat] }) });
}

export async function setCompass(on) {
  if (on === compassOn) return;
  const btn = $("#compassBtn");
  if (on) {
    // iOS lets a page read the compass only once asked, and asks only from a tap.
    if (typeof window.DeviceOrientationEvent?.requestPermission === "function") {
      try {
        if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return say(t("compass.denied"));
      } catch {
        return say(t("compass.denied"));
      }
    }
    compassOn = true;
    turned = map.getBearing();
    window.addEventListener("deviceorientationabsolute", onOrient);
    window.addEventListener("deviceorientation", onOrient);
    locate();
    clearTimeout(compassNote);
    compassNote = setTimeout(() => {
      if (compassOn && !compassAt) say(t("compass.none"), 6000);
    }, COMPASS_FRESH_MS);
  } else {
    compassOn = false;
    window.removeEventListener("deviceorientationabsolute", onOrient);
    window.removeEventListener("deviceorientation", onOrient);
    clearTimeout(compassNote);
    facing = null;
    compassAt = 0;
    map.easeTo({ bearing: 0, duration: 400 });
  }
  btn?.setAttribute("aria-pressed", String(compassOn));
}

// ---------- the buttons at the bottom right ----------

function syncControls() {
  const bearing = map.getBearing();
  $("#northBtn svg")?.style.setProperty("rotate", `${-bearing}deg`);
  $("#northBtn")?.classList.toggle("turned", Math.abs(bearing) > 0.5 || map.getPitch() > 0.5);
  $("#pitchBtn")?.setAttribute("aria-pressed", String(map.getPitch() > 5));
}

function wireControls() {
  $("#northBtn").addEventListener("click", () => {
    if (compassOn) setCompass(false);
    map.easeTo({ bearing: 0, pitch: 0, duration: 400 });
  });
  $("#compassBtn").addEventListener("click", () => setCompass(!compassOn));
  $("#locateBtn").addEventListener("click", locate);
  $("#pitchBtn").addEventListener("click", () => {
    if (map.getPitch() > 5) return map.easeTo({ pitch: 0, duration: 500 });
    map.easeTo({ pitch: TILT, zoom: Math.max(map.getZoom(), 15.2), duration: 700 });
    if (map.getZoom() < 14) say(t("pitch.zoom"));
  });
  map.on("rotate", syncControls);
  map.on("pitch", syncControls);
  // Dragged away from you: it stops following, the compass still turns it.
  map.on("dragstart", () => {
    following = false;
    $("#locateBtn")?.setAttribute("aria-pressed", "false");
  });
  syncControls();
}

// ---------- opening ----------

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function initMap(el) {
  const ml = window.maplibregl;
  if (!ml || !hasWebGL()) {
    el.innerHTML = `<p class="mapFail">${t("map.no-webgl")}</p>`;
    return null;
  }
  const view = storedView();
  map = new ml.Map({
    container: el,
    style: styleFor(),
    ...(view || HOME),
    minZoom: getBasemap() === "onemap" ? 10 : 9.5,
    maxZoom: 19.5,
    maxBounds: BOUNDS,
    maxPitch: 70,
    attributionControl: false,
    dragRotate: true,
    touchPitch: true,
    pitchWithRotate: true,
    fadeDuration: 0,
  });
  map.addControl(new ml.AttributionControl({ compact: true }), "bottom-left");
  map.addControl(new ml.ScaleControl({ unit: "metric", maxWidth: 90 }), "bottom-left");

  // An icon a style names that its sprite hasn't got: nothing, rather than a warning for each.
  // js/layers.js draws its own markers before this is asked.
  map.on("styleimagemissing", (e) => {
    if (!map.hasImage(e.id) && !e.id.startsWith("x-")) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });

  map.on("style.load", () => {
    styled = true;
    if (getBasemap() === "openfreemap") addBuildings();
    addMe();
    for (const fn of styleHooks) fn(map);
    raiseMe();
  });

  setTimeout(() => { if (!styled) fallBack("style"); }, STYLE_WAIT_MS);
  let fails = 0;
  map.on("error", (e) => {
    if (fallen || getBasemap() !== "openfreemap") return;
    if (!styled) return fallBack(e.error?.message || "style");
    const ofm = !e.sourceId || e.sourceId === "openmaptiles";
    if (ofm && navigator.onLine !== false && ++fails >= FAILS_TO_FALL_BACK) fallBack(e.error?.message || "tiles");
  });
  map.on("sourcedata", (e) => { if (e.sourceId === "openmaptiles" && e.tile) fails = 0; });

  // Light or dark with the page.
  new MutationObserver(applyStyle).observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });

  let keep = null;
  map.on("moveend", () => {
    clearTimeout(keep);
    keep = setTimeout(keepView, 800);
  });

  el.setAttribute("aria-label", t("map.label"));
  onChange(() => el.setAttribute("aria-label", t("map.label")));
  wireControls();
  return map;
}
