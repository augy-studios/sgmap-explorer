// The map's layers: what each one is, where its data comes from, how it's drawn, and the card a
// tap on one of its markers opens. Toggled from the Layers sheet and the quick buttons in the
// Edge Tray; the ones on are remembered.
//
// - A layer's data is fetched only when it's turned on (lazily), from /api/layer/<id> (the
//   server's trimmed copy of LTA's, NEA's or OneMap's feed) or from /data/ (MRT, planning areas,
//   vendored), and fetched again every `refresh` while the page is on show.
// - Dense point layers (bus stops, carparks, taxis, bicycle parking, OneMap themes) are
//   clustered until the map is close in.
// - Markers are white icons on a coloured disc (badges), drawn from js/icons.js onto a canvas.
// - Everything is put back over the base map each time its style changes (js/map.js onStyle).

import { getLocale, onChange, t } from "../i18n/i18n.js";
import { icons } from "./icons.js";
import { FONT, FONT_BOLD, getMap, isDark, onStyle, raiseMe, styleReady } from "./map.js";
import { showCard, hideCard } from "./card.js";
import { $, $$, escapeHtml, hydrateIcons, say } from "./ui.js";
import {
  COLOURS, LINE_COLOURS, carparkColour, clock, day, forecastLook, gridRound, heatColour, lineOf, pm25Band, psiBand,
  rainColour, shorten, tempColour, uvBand, windRotation,
} from "./format.js";

const ON_KEY = "sgmap.layers";
const OM_NAMES_KEY = "sgmap.onemapNames";
const DEFAULT_ON = ["mrt", "weather-2h"];
const MIN = 60 * 1000;
// Bicycle parking asked for by area (before the island-wide copy exists): from this zoom.
const AREA_ZOOM = 13.5;

const tAt = (ms) => (ms ? t("layer.updated", { time: clock(ms, getLocale()) }) : "");
const n = (v, unit = "") => (v == null ? "" : `${v}${unit}`);

// ---------- what each layer is ----------
//
// { id, group, icon, colour, kind: 'points' | 'labels' | 'rail' | 'areas' | 'radar',
//   url | load(), refresh (ms), cluster, minzoom, features(body) -> [{ lng, lat, i, icon?,
//   colour?, label?, rotate? }], card(item, body) -> card (js/card.js), panel(body) -> card }

const busCard = (s) => ({
  icon: "bus", colour: COLOURS.green, title: s.name || t("card.bus-stop"), subtitle: s.road,
  rows: [[t("card.stop-code"), s.code]],
  link: { href: `https://sgbus.uwuapps.org/#${encodeURIComponent(s.code)}`, text: t("card.bus-timings") },
});

const DEFS = [
  // Getting around
  {
    id: "mrt", group: "transport", icon: "train", colour: COLOURS.red, kind: "rail", quick: true,
    async load() {
      const [stations, tracks] = await Promise.all(["/data/rail-stations.json", "/data/rail-tracks.json"].map(getJson));
      return { stations: stations.stations || [], lines: tracks.lines || {} };
    },
    card: (s) => ({
      icon: "train", colour: LINE_COLOURS[lineOf(s.codes?.[0])] || COLOURS.red, title: s.name,
      subtitle: (s.codes || []).join(" · "),
      rows: [[t("card.exits"), String(s.exits?.length || "")]],
    }),
  },
  {
    id: "bus-stops", group: "transport", icon: "bus", colour: COLOURS.green, kind: "points", quick: true,
    url: "/api/layer/bus-stops", cluster: 13, features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i, label: s.name })), labelZoom: 16.5,
    card: busCard,
  },
  {
    id: "carparks", group: "transport", icon: "parking", colour: COLOURS.navy, kind: "points", quick: true,
    url: "/api/layer/carparks", refresh: 2 * MIN, cluster: 13,
    features: (b) => b.items.map((c, i) => ({ lng: c.lng, lat: c.lat, i, colour: carparkColour(c.lots?.car), label: c.lots?.car != null ? String(c.lots.car) : "" })),
    labelZoom: 14.5,
    card: (c, b) => ({
      icon: "parking", colour: carparkColour(c.lots?.car), title: c.name || c.id, subtitle: [c.agency, c.id].filter(Boolean).join(" · "),
      rows: [[t("card.lots-car"), n(c.lots?.car)], [t("card.lots-motorcycle"), n(c.lots?.motorcycle)], [t("card.lots-heavy"), n(c.lots?.heavy)]],
      at: tAt(b.at),
    }),
  },
  {
    id: "taxis", group: "transport", icon: "taxi", colour: COLOURS.amber, kind: "points", quick: true,
    url: "/api/layer/taxis", refresh: MIN, cluster: 14,
    features: (b) => b.points.map(([lng, lat], i) => ({ lng, lat, i })),
    card: (_x, b) => ({ icon: "taxi", colour: COLOURS.amber, title: t("card.taxi"), rows: [[t("card.taxis-free"), String(b.count)]], at: tAt(b.at) }),
    item: (b, i) => b.points[i],
  },
  {
    id: "taxi-stands", group: "transport", icon: "stand", colour: COLOURS.brown, kind: "points",
    url: "/api/layer/taxi-stands", cluster: 12, features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i })),
    card: (s) => ({
      icon: "stand", colour: COLOURS.brown, title: s.name || s.code, subtitle: s.code,
      rows: [[t("card.stand-type"), s.type === "Stop" ? t("card.stand-stop") : t("card.stand-stand")], [t("card.barrier-free"), s.barrierFree ? t("common.yes") : t("common.no")]],
    }),
  },
  {
    id: "bicycle-parking", group: "transport", icon: "bike", colour: COLOURS.teal, kind: "points",
    url: "/api/layer/bicycle-parking", cluster: 14, byArea: true, features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i })),
    card: (s) => ({
      icon: "bike", colour: COLOURS.teal, title: s.name || t("layer.bicycle-parking.name"),
      rows: [[t("card.racks"), n(s.lots)], [t("card.rack-type"), s.rack], [t("card.sheltered"), s.sheltered ? t("common.yes") : t("common.no")]],
    }),
  },
  {
    id: "ev-chargers", group: "transport", icon: "plug", colour: COLOURS.green, kind: "points",
    url: "/api/layer/ev-chargers", refresh: 5 * MIN, cluster: 13,
    features: (b) => b.items.map((c, i) => ({ lng: c.lng, lat: c.lat, i, colour: c.free > 0 ? COLOURS.green : COLOURS.grey })),
    card: (c, b) => ({
      icon: "plug", colour: c.free > 0 ? COLOURS.green : COLOURS.grey, title: c.name, subtitle: c.address,
      rows: [[t("card.chargers-free"), t("card.of", { a: c.free, b: c.points })]], at: tAt(b.at),
    }),
  },

  // Roads
  {
    id: "traffic-cams", group: "roads", icon: "camera", colour: COLOURS.slate, kind: "points", quick: true,
    url: "/api/layer/traffic-cams", refresh: 2 * MIN, features: (b) => b.items.map((c, i) => ({ lng: c.lng, lat: c.lat, i })),
    card: (c, b) => ({
      icon: "camera", colour: COLOURS.slate, title: t("card.camera", { id: c.id }),
      image: { src: c.image, alt: t("card.camera-alt", { id: c.id }) }, at: tAt(c.at || b.at),
    }),
  },
  {
    id: "emas", group: "roads", icon: "sign", colour: COLOURS.orange, kind: "points",
    url: "/api/layer/emas", refresh: 2 * MIN, features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i })),
    card: (s, b) => ({
      icon: "sign", colour: COLOURS.orange, title: t("card.emas-sign"), subtitle: s.id,
      note: s.message || t("card.emas-blank"), sections: travelTimes(b), at: tAt(b.at),
    }),
    panel: (b) => ({ icon: "sign", colour: COLOURS.orange, title: t("card.travel-times"), sections: travelTimes(b, true), at: tAt(b.at) }),
  },
  {
    id: "incidents", group: "roads", icon: "warning", colour: COLOURS.red, kind: "points",
    url: "/api/layer/incidents", refresh: 2 * MIN, features: (b) => b.items.map((x, i) => ({ lng: x.lng, lat: x.lat, i })),
    card: (x, b) => ({ icon: "warning", colour: COLOURS.red, title: x.type, note: x.message, at: tAt(b.at) }),
  },
  {
    id: "faulty-lights", group: "roads", icon: "light", colour: COLOURS.magenta, kind: "points",
    url: "/api/layer/faulty-lights", refresh: 2 * MIN, features: (b) => b.items.map((x, i) => ({ lng: x.lng, lat: x.lat, i })),
    card: (x, b) => ({
      icon: "light", colour: COLOURS.magenta, title: t(`card.light-${x.fault}`),
      subtitle: x.planned ? t("card.light-planned") : "", note: x.message, at: tAt(b.at),
    }),
  },

  // Weather
  {
    id: "weather-2h", group: "weather", icon: "partly", colour: COLOURS.amber, kind: "labels", quick: true,
    url: "/api/layer/weather-2h", refresh: 10 * MIN,
    features: (b) => b.items.map((a, i) => ({ lng: a.lng, lat: a.lat, i, ...look(forecastLook(a.forecast)), label: shorten(dayless(a.forecast), 18) })),
    labelZoom: 11.5,
    card: (a, b) => ({ ...look(forecastLook(a.forecast)), title: a.name, subtitle: a.forecast, rows: [[t("card.valid"), b.valid?.text]], at: tAt(b.at) }),
  },
  {
    id: "forecast-24h", group: "weather", icon: "calendar", colour: COLOURS.navy, kind: "labels",
    url: "/api/layer/forecast-24h", extra: "/api/layer/outlook-4d", refresh: 30 * MIN,
    features: (b) => b.items.map((r, i) => ({ lng: r.lng, lat: r.lat - 0.012, i, ...look(forecastLook(r.forecast)), label: `${t(`region.${r.region}`)}: ${shorten(dayless(r.forecast), 16)}` })),
    card: (r, b) => forecastCard(b, r),
    panel: (b) => forecastCard(b),
  },
  {
    id: "radar", group: "weather", icon: "radar", colour: COLOURS.blue, kind: "radar",
    url: "/api/layer/radar", refresh: 5 * MIN,
  },
  {
    id: "rainfall", group: "weather", icon: "drop", colour: COLOURS.blue, kind: "labels",
    url: "/api/layer/rainfall", refresh: 5 * MIN, labelZoom: 11,
    features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i, icon: "drop", colour: rainColour(s.value), label: `${s.value} mm` })),
    card: (s, b) => stationCard(s, b, "drop", rainColour(s.value), `${s.value} mm`, t("card.rain-5min")),
  },
  {
    id: "air-temp", group: "weather", icon: "thermometer", colour: COLOURS.orange, kind: "labels",
    url: "/api/layer/air-temp", refresh: 5 * MIN, labelZoom: 10,
    features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i, icon: "thermometer", colour: tempColour(s.value), label: `${s.value}°` })),
    card: (s, b) => stationCard(s, b, "thermometer", tempColour(s.value), `${s.value}°C`, t("card.air-temp")),
  },
  {
    id: "humidity", group: "weather", icon: "humidity", colour: COLOURS.teal, kind: "labels",
    url: "/api/layer/humidity", refresh: 5 * MIN, labelZoom: 10,
    features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i, icon: "humidity", colour: COLOURS.teal, label: `${Math.round(s.value)}%` })),
    card: (s, b) => stationCard(s, b, "humidity", COLOURS.teal, `${Math.round(s.value)}%`, t("card.humidity")),
  },
  {
    id: "wind", group: "weather", icon: "wind", colour: COLOURS.teal, kind: "labels",
    url: "/api/layer/wind", refresh: 5 * MIN, labelZoom: 10,
    features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i, icon: "arrow", colour: COLOURS.teal, rotate: windRotation(s.direction), label: `${s.speed} kn` })),
    card: (s, b) => ({
      icon: "wind", colour: COLOURS.teal, title: s.name,
      rows: [[t("card.wind-speed"), `${s.speed} ${t("card.knots")}`], [t("card.wind-from"), s.direction == null ? "" : `${s.direction}°`]], at: tAt(b.at),
    }),
  },
  {
    id: "lightning", group: "weather", icon: "bolt", colour: COLOURS.purple, kind: "points",
    url: "/api/layer/lightning", refresh: 2 * MIN, features: (b) => b.items.map((x, i) => ({ lng: x.lng, lat: x.lat, i })),
    card: (x, b) => ({ icon: "bolt", colour: COLOURS.purple, title: t(x.kind === "ground" ? "card.lightning-ground" : "card.lightning-cloud"), at: tAt(x.at || b.at) }),
  },
  {
    id: "flood", group: "weather", icon: "flood", colour: COLOURS.red, kind: "points",
    url: "/api/layer/flood", refresh: 2 * MIN, features: (b) => b.items.map((x, i) => ({ lng: x.lng, lat: x.lat, i })),
    card: (x) => ({ icon: "flood", colour: COLOURS.red, title: x.headline || t("layer.flood.name"), subtitle: x.severity, note: [x.description, x.instruction].filter(Boolean).join(" "), at: tAt(x.issued) }),
    empty: "layer.flood.none",
  },
  {
    id: "wbgt", group: "weather", icon: "heat", colour: COLOURS.red, kind: "labels",
    url: "/api/layer/wbgt", refresh: 15 * MIN, labelZoom: 10,
    features: (b) => b.items.map((s, i) => ({ lng: s.lng, lat: s.lat, i, icon: "heat", colour: heatColour(s.heat), label: `${s.value}°` })),
    card: (s, b) => ({
      icon: "heat", colour: heatColour(s.heat), title: s.name, subtitle: s.town,
      rows: [[t("card.wbgt"), `${s.value}°C`], [t("card.heat-stress"), s.heat ? t(`heat.${s.heat.toLowerCase()}`) : ""]], at: tAt(b.at),
    }),
  },
  {
    id: "uv", group: "weather", icon: "uv", colour: COLOURS.orange, kind: "labels",
    url: "/api/layer/uv", refresh: 15 * MIN,
    features: (b) => b.items.map((u, i) => ({ lng: u.lng, lat: u.lat + 0.02, i, icon: "uv", colour: uvBand(u.value).colour, label: t("card.uv-label", { value: u.value }) })),
    card: (_u, b) => uvCard(b),
    panel: (b) => uvCard(b),
  },

  // Air
  {
    id: "psi", group: "air", icon: "air", colour: COLOURS.green, kind: "labels",
    url: "/api/layer/psi", refresh: 15 * MIN,
    features: (b) => b.items.filter((r) => r.psi != null).map((r, i) => ({ lng: r.lng, lat: r.lat + 0.012, i, icon: "air", colour: psiBand(r.psi).colour, label: `PSI ${r.psi}` })),
    item: (b, i) => b.items.filter((r) => r.psi != null)[i],
    card: (r, b) => ({
      icon: "air", colour: psiBand(r.psi).colour, title: t(`region.${r.region}`), subtitle: t(`psi.${psiBand(r.psi).band}`),
      rows: [[t("card.psi-24h"), n(r.psi)], [t("card.pm25-24h"), n(r.pm25, " µg/m³")], [t("card.pm10-24h"), n(r.pm10, " µg/m³")], [t("card.o3-8h"), n(r.o3, " µg/m³")]],
      at: tAt(b.at),
    }),
  },
  {
    id: "pm25", group: "air", icon: "haze", colour: COLOURS.slate, kind: "labels",
    url: "/api/layer/pm25", refresh: 15 * MIN,
    features: (b) => b.items.filter((r) => r.value != null).map((r, i) => ({ lng: r.lng + 0.03, lat: r.lat - 0.012, i, icon: "haze", colour: pm25Band(r.value).colour, label: `PM2.5 ${r.value}` })),
    item: (b, i) => b.items.filter((r) => r.value != null)[i],
    card: (r, b) => ({
      icon: "haze", colour: pm25Band(r.value).colour, title: t(`region.${r.region}`), subtitle: t(`pm25.${pm25Band(r.value).band}`),
      rows: [[t("card.pm25-1h"), n(r.value, " µg/m³")]], at: tAt(b.at),
    }),
  },

  // Places
  {
    id: "planning-areas", group: "places", icon: "area", colour: COLOURS.purple, kind: "areas",
    load: () => getJson("/data/planning-areas.json"),
  },
];

const look = ({ icon, colour }) => ({ icon, colour });
// "Partly Cloudy (Day)" as "Partly Cloudy" on the map: the icon already says day or night.
const dayless = (s) => String(s || "").replace(/\s*\((Day|Night)\)\s*$/i, "");

function stationCard(s, b, icon, colour, value, what) {
  return { icon, colour, title: s.name, subtitle: what, rows: [[t("card.reading"), value], [t("card.station"), s.id]], at: tAt(b.at) };
}

function travelTimes(b, open = false) {
  const byRoad = new Map();
  for (const x of b.times || []) {
    const key = `${x.road} ${t("card.towards", { place: x.towards })}`;
    if (!byRoad.has(key)) byRoad.set(key, []);
    byRoad.get(key).push([`${x.from} – ${x.to}`, t("card.minutes", { count: x.minutes })]);
  }
  return [...byRoad].map(([title, rows]) => ({ title, rows, open }));
}

function forecastCard(b, region) {
  const g = b.general || {};
  const outlook = state.get("forecast-24h")?.extraBody?.days || [];
  const range = (r, unit) => (r?.low != null ? `${r.low}–${r.high}${unit}` : "");
  return {
    icon: "calendar", colour: COLOURS.navy,
    title: region ? t(`region.${region.region}`) : t("layer.forecast-24h.name"),
    subtitle: region ? region.forecast : g.forecast,
    rows: [
      [t("card.island"), g.forecast],
      [t("card.temperature"), range(g.temperature, "°C")],
      [t("card.humidity"), range(g.humidity, "%")],
      [t("card.wind"), g.wind?.low != null ? `${range(g.wind, " km/h")} ${g.wind.direction}` : ""],
    ],
    sections: [
      { title: t("card.periods"), rows: (b.periods || []).map((p) => [p.text, region ? p.regions?.[region.region] : Object.values(p.regions || {}).filter(Boolean)[0] || ""]), open: true },
      ...(outlook.length ? [{ title: t("card.outlook"), rows: outlook.map((d) => [day(d.date, getLocale()) || d.day, `${d.forecast}, ${range(d.temperature, "°C")}`]) }] : []),
    ],
    at: tAt(b.at),
  };
}

function uvCard(b) {
  const now = b.hours?.[b.hours.length - 1];
  return {
    icon: "uv", colour: uvBand(now?.value).colour, title: t("layer.uv.name"),
    subtitle: now ? `${now.value}, ${t(`uv.${uvBand(now.value).band}`)}` : "",
    rows: (b.hours || []).slice(-8).map((h) => [clock(h.hour, getLocale()), String(h.value)]),
    at: tAt(b.at),
  };
}

// ---------- OneMap's themes, each a layer of its own ----------

let omThemes = null; // [{ q, name, category }]
let omNames = readJson(OM_NAMES_KEY, {});

function omDef(q) {
  return {
    id: `om:${q}`, group: "onemap", icon: "pin", colour: COLOURS.purple, kind: "points", onemap: q,
    url: `/api/layer/onemap?theme=${encodeURIComponent(q)}`, cluster: 13, labelZoom: 16,
    features: (b) => b.items.map((p, i) => ({ lng: p.lng, lat: p.lat, i, label: p.name })),
    card: (p, b) => ({ icon: "pin", colour: COLOURS.purple, title: p.name, subtitle: b.name || omNames[q] || q, note: p.description, rows: [[t("card.address"), p.address]] }),
  };
}

const defs = new Map(DEFS.map((d) => [d.id, d]));
const defOf = (id) => defs.get(id) || (id.startsWith("om:") ? (defs.set(id, omDef(id.slice(3))), defs.get(id)) : null);

// ---------- state ----------

const state = new Map(); // id -> { on, body, extraBody, at, error, loading, timer }
const st = (id) => {
  if (!state.has(id)) state.set(id, { on: false });
  return state.get(id);
};

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function saveOn() {
  try {
    localStorage.setItem(ON_KEY, JSON.stringify([...state].filter(([, s]) => s.on).map(([id]) => id)));
  } catch { /* this page view only */ }
}

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  let body = null;
  try {
    body = await r.json();
  } catch { /* not JSON */ }
  if (!r.ok) throw new Error(body?.error || t("layer.failed"));
  return body;
}

// ---------- badges: white icons on a coloured disc ----------

const BADGE_PX = 26;
const RATIO = 2;
const badgeData = new Map();

// An icon's SVG as canvas paths: its <path>, <circle> and <rect>, no SVG image needed.
function iconPaths(name) {
  const src = icons[name] || icons.pin;
  const paths = [];
  for (const m of src.matchAll(/<(path|circle|rect)\b([^>]*)\/>/g)) {
    const a = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const p = new Path2D();
    if (m[1] === "path") p.addPath(new Path2D(a.d));
    else if (m[1] === "circle") p.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
    else if (p.roundRect && a.rx) p.roundRect(+a.x, +a.y, +a.width, +a.height, +a.rx);
    else p.rect(+a.x, +a.y, +a.width, +a.height);
    paths.push(p);
  }
  return paths;
}

const badgeKey = (icon, colour) => `x-b-${icon}-${colour.slice(1)}`;

function badgeImage(icon, colour) {
  const key = badgeKey(icon, colour);
  if (badgeData.has(key)) return badgeData.get(key);
  const px = BADGE_PX * RATIO;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const g = c.getContext("2d");
  g.beginPath();
  g.arc(px / 2, px / 2, px / 2 - RATIO, 0, Math.PI * 2);
  g.fillStyle = colour;
  g.fill();
  g.lineWidth = 2 * RATIO;
  g.strokeStyle = "#ffffff";
  g.stroke();
  const scale = (px * 0.6) / 24;
  g.save();
  g.translate(px * 0.2, px * 0.2);
  g.scale(scale, scale);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 2.1;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const p of iconPaths(icon)) g.stroke(p);
  g.restore();
  const data = g.getImageData(0, 0, px, px);
  badgeData.set(key, data);
  return data;
}

function ensureBadge(map, icon, colour) {
  const key = badgeKey(icon, colour);
  if (!map.hasImage(key)) map.addImage(key, badgeImage(icon, colour), { pixelRatio: RATIO });
  return key;
}

// ---------- drawing ----------

const Z = { areas: 0, radar: 1, rail: 2, points: 3, labels: 4 };
const sourceId = (id) => `x-${id.replace(/[^a-z0-9-]/gi, "-")}`;
const ownLayers = new Map(); // def id -> [map layer ids]

const textColours = () => (isDark() ? { color: "#eef2ef", halo: "#0c100e" } : { color: "#121815", halo: "#ffffff" });

// The first map layer drawn by a layer that goes above `def`, so `def`'s go in under it.
function beforeId(map, def) {
  const above = DEFS.concat([...defs.values()].filter((d) => d.onemap))
    .filter((d) => d !== def && st(d.id).on && Z[d.kind] > Z[def.kind])
    .flatMap((d) => ownLayers.get(d.id) || [])
    .find((lid) => map.getLayer(lid));
  return above || (map.getLayer("me-accuracy") ? "me-accuracy" : undefined);
}

function toGeo(def, body) {
  const list = def.features ? def.features(body) : [];
  return {
    type: "FeatureCollection",
    features: list.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.lng, f.lat] },
      properties: { i: f.i, label: f.label || "", badge: badgeKey(f.icon || def.icon, f.colour || def.colour), rotate: f.rotate || 0, icon: f.icon || def.icon, colour: f.colour || def.colour },
    })),
  };
}

function removeLayers(map, def) {
  for (const lid of ownLayers.get(def.id) || []) if (map.getLayer(lid)) map.removeLayer(lid);
  const src = sourceId(def.id);
  for (const s of [src, `${src}-lines`, `${src}-stations`]) if (map.getSource(s)) map.removeSource(s);
  ownLayers.delete(def.id);
}

function draw(def) {
  const map = getMap();
  const s = st(def.id);
  if (!map || !styleReady()) return;
  if (!s.on || !s.body) return removeLayers(map, def);
  const add = (layer) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, beforeId(map, def));
    ownLayers.set(def.id, [...new Set([...(ownLayers.get(def.id) || []), layer.id])]);
  };
  const src = sourceId(def.id);
  const tc = textColours();

  if (def.kind === "rail") return drawRail(map, def, s.body, add, tc);
  if (def.kind === "areas") return drawAreas(map, def, s.body, add, tc);
  if (def.kind === "radar") return drawRadar(map, def, s.body, add);

  const geo = toGeo(def, s.body);
  for (const f of geo.features) ensureBadge(map, f.properties.icon, f.properties.colour);
  const cluster = def.cluster && geo.features.length > 200;
  const existing = map.getSource(src);
  if (existing && s.clustered === Boolean(cluster)) existing.setData(geo);
  else {
    if (existing) removeLayers(map, def);
    map.addSource(src, { type: "geojson", data: geo, ...(cluster && { cluster: true, clusterMaxZoom: def.cluster, clusterRadius: 48 }) });
    s.clustered = Boolean(cluster);
  }
  if (cluster) {
    add({
      id: `${src}-cluster`, type: "circle", source: src, filter: ["has", "point_count"],
      paint: {
        "circle-color": def.colour, "circle-opacity": 0.92, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 14, 50, 18, 250, 23, 1000, 28],
      },
    });
    add({
      id: `${src}-count`, type: "symbol", source: src, filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT_BOLD, "text-size": 12, "text-allow-overlap": true },
      paint: { "text-color": "#ffffff" },
    });
  }
  const single = cluster ? ["!", ["has", "point_count"]] : ["all"];
  add({
    id: `${src}-icon`, type: "symbol", source: src, filter: single,
    layout: {
      "icon-image": ["get", "badge"], "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.72, 15, 0.95, 18, 1.1],
      "icon-allow-overlap": true, "icon-ignore-placement": def.kind !== "labels",
      "icon-rotate": ["get", "rotate"], "icon-rotation-alignment": def.id === "wind" ? "map" : "viewport",
    },
  });
  if (def.labelZoom != null || def.kind === "labels") {
    add({
      id: `${src}-label`, type: "symbol", source: src, filter: single, minzoom: def.labelZoom ?? 0,
      layout: {
        "text-field": ["get", "label"], "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 16, 13],
        "text-anchor": "left", "text-offset": [1.15, 0], "text-optional": true, "text-max-width": 9,
      },
      paint: { "text-color": tc.color, "text-halo-color": tc.halo, "text-halo-width": 1.6 },
    });
  }
}

function drawRail(map, def, body, add, tc) {
  const src = sourceId(def.id);
  const lines = {
    type: "FeatureCollection",
    features: Object.entries(body.lines).flatMap(([code, parts]) =>
      parts.map((pts) => ({ type: "Feature", properties: { colour: LINE_COLOURS[code] || "#748477" }, geometry: { type: "LineString", coordinates: pts.map(([lat, lng]) => [lng, lat]) } }))
    ),
  };
  const stations = {
    type: "FeatureCollection",
    features: body.stations.map((s, i) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: { i, name: s.name, colour: LINE_COLOURS[lineOf(s.codes?.[0])] || "#748477", interchange: (s.codes?.length || 0) > 1 },
    })),
  };
  if (map.getSource(`${src}-lines`)) map.getSource(`${src}-lines`).setData(lines);
  else map.addSource(`${src}-lines`, { type: "geojson", data: lines });
  if (map.getSource(src)) map.getSource(src).setData(stations);
  else map.addSource(src, { type: "geojson", data: stations });
  const w = (more) => ["interpolate", ["linear"], ["zoom"], 10, 1.6 + more, 13, 3 + more, 16, 5 + more, 19, 8 + more];
  add({ id: `${src}-edge`, type: "line", source: `${src}-lines`, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": w(2), "line-opacity": isDark() ? 0.35 : 0.9 } });
  add({ id: `${src}-line`, type: "line", source: `${src}-lines`, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "colour"], "line-width": w(0) } });
  add({
    id: `${src}-icon`, type: "circle", source: src,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "interchange"], 3.5, 2.5], 14, ["case", ["get", "interchange"], 7, 5.5], 18, ["case", ["get", "interchange"], 11, 9]],
      "circle-color": ["case", ["get", "interchange"], "#ffffff", ["get", "colour"]],
      "circle-stroke-color": ["case", ["get", "interchange"], "#121815", "#ffffff"],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2],
    },
  });
  add({
    id: `${src}-label`, type: "symbol", source: src, minzoom: 12.5,
    layout: { "text-field": ["get", "name"], "text-font": FONT_BOLD, "text-size": 12, "text-anchor": "top", "text-offset": [0, 0.9], "text-optional": true },
    paint: { "text-color": tc.color, "text-halo-color": tc.halo, "text-halo-width": 1.8 },
  });
}

function drawAreas(map, def, body, add, tc) {
  const src = sourceId(def.id);
  const geo = {
    type: "FeatureCollection",
    features: (body.areas || []).map((a, i) => ({ type: "Feature", properties: { i, name: a.name }, geometry: { type: "MultiPolygon", coordinates: a.polygons } })),
  };
  if (map.getSource(src)) map.getSource(src).setData(geo);
  else map.addSource(src, { type: "geojson", data: geo });
  add({ id: `${src}-fill`, type: "fill", source: src, paint: { "fill-color": def.colour, "fill-opacity": 0.06 } });
  add({ id: `${src}-line`, type: "line", source: src, paint: { "line-color": def.colour, "line-width": 1.4, "line-opacity": 0.75, "line-dasharray": [3, 2] } });
  add({
    id: `${src}-label`, type: "symbol", source: src, maxzoom: 15,
    layout: { "text-field": ["upcase", ["get", "name"]], "text-font": FONT_BOLD, "text-size": 11, "text-letter-spacing": 0.08, "text-max-width": 8 },
    paint: { "text-color": isDark() ? "#e3c9ff" : "#5b2a8c", "text-halo-color": tc.halo, "text-halo-width": 1.6 },
  });
}

function drawRadar(map, def, body, add) {
  const src = sourceId(def.id);
  if (!body.image || !body.corners) return removeLayers(map, def);
  const existing = map.getSource(src);
  if (existing?.updateImage) existing.updateImage({ url: body.image, coordinates: body.corners });
  else map.addSource(src, { type: "image", url: body.image, coordinates: body.corners });
  add({ id: `${src}-raster`, type: "raster", source: src, paint: { "raster-opacity": 0.6, "raster-fade-duration": 0 } });
}

// ---------- loading ----------

let areaItems = new Map(); // bicycle parking asked for by area, kept as the map moves
const areasAsked = new Set();

async function load(def, { quiet = false } = {}) {
  const s = st(def.id);
  if (s.loading) return;
  s.loading = true;
  if (!quiet) s.error = "";
  renderRows();
  try {
    const body = def.load ? await def.load() : await getJson(def.url);
    if (def.extra) s.extraBody = await getJson(def.extra).catch(() => s.extraBody || null);
    s.body = body;
    s.at = body?.at || Date.now();
    s.error = "";
    if (def.byArea && body?.byArea) {
      s.byArea = true;
      s.body = { ...body, items: [...areaItems.values()] };
      loadArea(def);
    }
    if (def.empty && Array.isArray(body?.items) && !body.items.length) say(t(def.empty));
  } catch (err) {
    s.error = navigator.onLine === false ? t("layer.offline") : err.message || t("layer.failed");
    if (!quiet) say(`${layerName(def)}: ${s.error}`);
  } finally {
    s.loading = false;
  }
  if (s.on) draw(def);
  renderRows();
}

// Bicycle parking round the middle of the map, when only areas can be asked for.
async function loadArea(def) {
  const map = getMap();
  const s = st(def.id);
  if (!s.on || !s.byArea || !map) return;
  if (map.getZoom() < AREA_ZOOM) return say(t("layer.zoom-in"));
  const c = map.getCenter();
  const key = `${gridRound(c.lat)},${gridRound(c.lng)}`;
  if (areasAsked.has(key)) return;
  areasAsked.add(key);
  try {
    const body = await getJson(`${def.url}?lat=${gridRound(c.lat)}&lng=${gridRound(c.lng)}`);
    for (const it of body.items || []) areaItems.set(`${it.lat},${it.lng}`, it);
    s.body = { ...s.body, items: [...areaItems.values()] };
    draw(def);
  } catch {
    areasAsked.delete(key);
  }
}

function schedule(def) {
  const s = st(def.id);
  clearInterval(s.timer);
  s.timer = null;
  if (s.on && def.refresh) {
    s.timer = setInterval(() => {
      if (document.visibilityState === "visible") load(def, { quiet: true });
    }, def.refresh);
  }
}

export function setLayer(id, on) {
  const def = defOf(id);
  if (!def) return;
  const s = st(id);
  if (s.on === on) return;
  s.on = on;
  saveOn();
  schedule(def);
  if (!on) {
    const map = getMap();
    if (map) removeLayers(map, def);
    hideCard();
  } else if (!s.body || (def.refresh && Date.now() - (s.fetched || 0) > def.refresh)) {
    s.fetched = Date.now();
    load(def);
  } else draw(def);
  syncQuick();
  renderRows();
}

const isOn = (id) => st(id).on;

// ---------- taps on the map ----------

function onClick(e) {
  const map = getMap();
  const ids = [...ownLayers.values()].flat().filter((lid) => /-(icon|cluster|fill)$/.test(lid) && map.getLayer(lid));
  if (!ids.length) return hideCard();
  const pad = 10;
  const hits = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers: ids });
  // Markers before areas: a tap on a stop inside a planning area is about the stop.
  const hit = hits.find((f) => !f.layer.id.endsWith("-fill")) || hits[0];
  if (!hit) return hideCard();
  const def = [...defs.values()].find((d) => hit.layer.id.startsWith(`${sourceId(d.id)}-`));
  if (!def) return;
  if (hit.properties.point_count) {
    map.getSource(hit.layer.source).getClusterExpansionZoom(hit.properties.cluster_id).then((z) => {
      map.easeTo({ center: hit.geometry.coordinates, zoom: Math.min(z + 0.2, 19) });
    }).catch(() => {});
    return;
  }
  const s = st(def.id);
  if (def.kind === "areas") {
    const a = s.body.areas?.[hit.properties.i];
    return a && showCard({ icon: "area", colour: def.colour, title: a.name, subtitle: t("card.region", { region: a.region }) });
  }
  if (def.kind === "rail") return showCard(def.card(s.body.stations[hit.properties.i], s.body));
  const item = def.item ? def.item(s.body, hit.properties.i) : s.body.items?.[hit.properties.i];
  if (def.card) showCard(def.card(item, s.body));
}

// ---------- the Layers sheet and the quick buttons ----------

const GROUPS = ["transport", "roads", "weather", "air", "places"];

const layerName = (def) => (def.onemap ? omNames[def.onemap] || def.onemap : t(`layer.${def.id}.name`));

function rowHtml(def) {
  const s = st(def.id);
  const name = layerName(def);
  const note = s.loading ? t("layer.loading") : s.error ? s.error : s.on && s.at ? tAt(s.at) : def.onemap ? "" : t(`layer.${def.id}.note`);
  return (
    `<div class="layerRow">` +
    `<button type="button" class="layerSwitch" role="switch" aria-checked="${s.on}" data-layer="${escapeHtml(def.id)}">` +
    `<span class="layerBadge" style="--badge:${def.colour}" data-icon="${def.icon}"></span>` +
    `<span class="layerText"><span class="layerName">${escapeHtml(name)}</span><span class="layerNote${s.error ? " err" : ""}">${escapeHtml(note)}</span></span>` +
    `<span class="switchTrack" aria-hidden="true"><span></span></span></button>` +
    (def.panel && s.on && s.body ? `<button type="button" class="pill" data-panel="${def.id}">${escapeHtml(t("layer.details"))}</button>` : "") +
    `</div>`
  );
}

function renderRows() {
  const list = $("#layersList");
  if (!list || $("#layersModal").classList.contains("hidden")) return;
  const focusId = document.activeElement?.dataset?.layer;
  list.innerHTML = GROUPS.map((g) =>
    `<section class="layerGroup"><h3>${escapeHtml(t(`group.${g}`))}</h3>${DEFS.filter((d) => d.group === g).map(rowHtml).join("")}</section>`
  ).join("") + onemapHtml();
  hydrateIcons(list);
  if (focusId) list.querySelector(`[data-layer="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
}

let omQuery = "";

function onemapHtml() {
  const picked = [...state].filter(([id, s]) => id.startsWith("om:") && s.on).map(([id]) => defOf(id));
  let results = "";
  if (omThemes === null) results = `<p class="layerHint">${escapeHtml(t("onemap.loading"))}</p>`;
  else if (omThemes === false) results = `<p class="layerHint err">${escapeHtml(t("onemap.unavailable"))}</p>`;
  else {
    const q = omQuery.trim().toLowerCase();
    const found = omThemes.filter((th) => !state.get(`om:${th.q}`)?.on && (!q || `${th.name} ${th.category}`.toLowerCase().includes(q))).slice(0, q ? 40 : 12);
    results = found.map((th) => rowHtml(defOf(`om:${th.q}`))).join("") +
      `<p class="layerHint">${escapeHtml(t("onemap.count", { count: omThemes.length }))}</p>`;
  }
  return (
    `<section class="layerGroup" id="onemapGroup"><h3>${escapeHtml(t("group.onemap"))}</h3>` +
    picked.map(rowHtml).join("") +
    `<label class="searchBox"><span data-icon="search"></span><input type="search" id="omSearch" value="${escapeHtml(omQuery)}" placeholder="${escapeHtml(t("onemap.search"))}" aria-label="${escapeHtml(t("onemap.search"))}" autocomplete="off"></label>` +
    `<div id="omResults">${results}</div></section>`
  );
}

async function loadThemes() {
  if (omThemes) return;
  try {
    const body = await getJson("/api/layer/onemap-themes");
    omThemes = body.themes || [];
    for (const th of omThemes) omNames[th.q] = th.name;
    try {
      localStorage.setItem(OM_NAMES_KEY, JSON.stringify(omNames));
    } catch { /* names shown as query names next time */ }
  } catch {
    omThemes = false;
  }
  renderRows();
}

function syncQuick() {
  for (const btn of $$("[data-quick-layer]")) btn.setAttribute("aria-pressed", String(isOn(btn.dataset.quickLayer)));
}

export function openLayers() {
  renderRows();
  loadThemes();
}

export function initLayers() {
  const list = $("#layersList");
  list.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-layer]");
    if (sw) return setLayer(sw.dataset.layer, sw.getAttribute("aria-checked") !== "true");
    const more = e.target.closest("[data-panel]");
    if (more) {
      const def = defOf(more.dataset.panel);
      const s = st(def.id);
      if (s.body) showCard({ ...def.panel(s.body), focus: true });
    }
  });
  list.addEventListener("input", (e) => {
    if (e.target.id !== "omSearch") return;
    omQuery = e.target.value;
    const results = $("#omResults");
    const wrap = document.createElement("div");
    wrap.innerHTML = onemapHtml();
    results.innerHTML = wrap.querySelector("#omResults").innerHTML;
    hydrateIcons(results);
  });
  for (const btn of $$("[data-quick-layer]")) btn.addEventListener("click", () => setLayer(btn.dataset.quickLayer, !isOn(btn.dataset.quickLayer)));

  const map = getMap();
  if (map) {
    map.on("click", onClick);
    map.on("moveend", () => {
      const def = defOf("bicycle-parking");
      if (st(def.id).byArea) loadArea(def);
    });
    map.on("mousemove", (e) => {
      const ids = [...ownLayers.values()].flat().filter((lid) => /-(icon|cluster)$/.test(lid) && map.getLayer(lid));
      const hit = ids.length && map.queryRenderedFeatures(e.point, { layers: ids }).length;
      map.getCanvas().style.cursor = hit ? "pointer" : "";
    });
    // Put back over every new style: the base map changed, or light and dark.
    onStyle(() => {
      ownLayers.clear();
      for (const def of [...defs.values()].sort((a, b) => Z[a.kind] - Z[b.kind])) if (st(def.id).on) draw(def);
      raiseMe();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    for (const [id, s] of state) {
      const def = defOf(id);
      if (s.on && def?.refresh && Date.now() - (s.at || 0) > def.refresh) load(def, { quiet: true });
    }
  });
  onChange(() => {
    renderRows();
    // The labels some layers build from words (region names, UV) are drawn again in the new language.
    for (const def of defs.values()) if (st(def.id).on && def.kind === "labels") draw(def);
  });

  const on = readJson(ON_KEY, DEFAULT_ON);
  for (const id of Array.isArray(on) ? on : DEFAULT_ON) setLayer(id, true);
  syncQuick();
}

// For the tour and the screenshots: which layers are on.
export const layersOn = () => [...state].filter(([, s]) => s.on).map(([id]) => id);
