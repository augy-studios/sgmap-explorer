// Server-side data minimisation: no route passes an upstream or database payload to the
// browser as it came, and no key ever reaches it.
//
// 1. A scan of every file in api/: only api/_lib/respond.js writes a reply (res.json, res.send,
//    res.end), and nothing outside api/_lib/http.js, onemap.js and supabase.js reads a key.
// 2. Every layer's trim(), fed an upstream reply with a canary field in every object (from
//    docs/'s OpenAPI samples, or written from LTA's guide), sends back none of it, and only the
//    fields its allow-list names.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { LAYERS } from "../api/_layers/index.js";
import { CANARY, LTA, ONEMAP, dgsData, fromDocs } from "./fixtures.mjs";

const API = join(dirname(fileURLToPath(import.meta.url)), "..", "api");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".js")) files.push(p);
  }
})(API);

const rel = (p) => relative(API, p);
// The code without its comments (whole-line ones: a // inside a string is part of a URL).
const code = (p) => readFileSync(p, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("only api/_lib/respond.js writes a reply", () => {
  for (const f of files) {
    if (rel(f) === "_lib/respond.js") continue;
    const src = code(f);
    assert.doesNotMatch(src, /\bres(?:ponse)?\s*\.\s*(json|send|end|write)\s*\(/, `${rel(f)} writes a reply itself`);
    assert.doesNotMatch(src, /\.status\(\s*\d+\s*\)\s*\.\s*(json|send)/, `${rel(f)} writes a reply itself`);
  }
});

test("every route replies through sendJson, sendError or sendImage", () => {
  const routes = files.filter((f) => !rel(f).startsWith("_"));
  assert.ok(routes.length >= 3);
  for (const f of routes) assert.match(code(f), /\bsend(Json|Error|Image)\(/, `${rel(f)} doesn't use respond.js`);
});

test("keys are read only where they go into an upstream request", () => {
  // The cron and the webhook read their secrets only to compare them; site.js reads the site's
  // own address.
  const allowed = new Set(["_lib/http.js", "_lib/onemap.js", "_lib/supabase.js", "_lib/telegram.js", "_lib/site.js", "cron.js", "telegram/webhook.js"]);
  for (const f of files) {
    const src = code(f);
    for (const m of src.matchAll(/process\.env\.([A-Z_]+)/g)) {
      if (allowed.has(rel(f))) continue;
      assert.fail(`${rel(f)} reads process.env.${m[1]}`);
    }
  }
  assert.doesNotMatch(code(join(API, "cron.js")), /process\.env\.(?!CRON_SECRET)/);
  assert.doesNotMatch(code(join(API, "telegram/webhook.js")), /process\.env\.(?!TELEGRAM_WEBHOOK_SECRET|TELEGRAM_BOT_USERNAME)/);
  assert.doesNotMatch(code(join(API, "_lib/site.js")), /process\.env\.(?!SITE_URL)/);
});

// ---------- each layer's trim ----------

// Every key an item, or the reply itself, may have.
const ALLOW = {
  "bus-stops": ["code", "name", "road", "lat", "lng"],
  carparks: ["id", "name", "agency", "lat", "lng", "lots", "car", "motorcycle", "heavy"],
  taxis: [],
  "taxi-stands": ["code", "name", "type", "barrierFree", "lat", "lng"],
  "bicycle-parking": ["name", "rack", "lots", "sheltered", "lat", "lng"],
  "ev-chargers": ["name", "address", "lat", "lng", "points", "free"],
  "traffic-cams": ["id", "lat", "lng", "image", "at"],
  emas: ["id", "lat", "lng", "message", "road", "direction", "towards", "from", "to", "minutes"],
  incidents: ["type", "message", "lat", "lng"],
  "faulty-lights": ["fault", "planned", "message", "lat", "lng"],
  "weather-2h": ["name", "forecast", "lat", "lng", "start", "end", "text"],
  "forecast-24h": ["region", "lat", "lng", "forecast", "temperature", "humidity", "wind", "low", "high", "direction", "start", "end", "text", "regions", "north", "south", "east", "west", "central", "valid"],
  "outlook-4d": ["day", "date", "forecast", "summary", "temperature", "humidity", "wind", "low", "high", "direction"],
  "air-temp": ["id", "name", "lat", "lng", "value"],
  rainfall: ["id", "name", "lat", "lng", "value"],
  humidity: ["id", "name", "lat", "lng", "value"],
  wind: ["id", "name", "lat", "lng", "speed", "direction"],
  psi: ["region", "lat", "lng", "psi", "pm25", "pm10", "o3"],
  pm25: ["region", "lat", "lng", "value"],
  uv: ["lat", "lng", "value", "hour"],
  wbgt: ["id", "name", "town", "lat", "lng", "value", "heat"],
  lightning: ["lat", "lng", "at", "kind"],
  flood: ["headline", "description", "instruction", "severity", "issued", "lat", "lng"],
  radar: [],
  "onemap-themes": ["q", "name", "category"],
  onemap: ["name", "description", "address", "lat", "lng"],
};
const TOP = new Set(["at", "items", "unit", "count", "points", "valid", "general", "periods", "days", "times", "hours", "image", "corners", "themes", "theme", "name", "owner", "byArea", "area"]);

const W = (f, p) => dgsData(f, p);
const SAMPLES = {
  "bus-stops": [LTA.busStops],
  carparks: [LTA.carparks],
  taxis: [
    { from: "dgs", body: { type: "FeatureCollection", __canary: CANARY, features: [{ __canary: CANARY, geometry: { type: "MultiPoint", coordinates: [[103.85, 1.3], [103.9, 1.35]] }, properties: { __canary: CANARY, timestamp: "2026-10-26T08:00:00+08:00", taxi_count: 2 } }] } },
    { from: "lta", body: LTA.taxis },
  ],
  "taxi-stands": [LTA.taxiStands],
  "bicycle-parking": [LTA.bicycle, { lat: 1.39, lng: 103.83 }],
  "ev-chargers": [LTA.ev],
  "traffic-cams": [
    { from: "dgs", body: { api_info: { status: "healthy" }, items: [{ __canary: CANARY, timestamp: "2026-10-26T08:00:00+08:00", cameras: [{ __canary: CANARY, camera_id: "1001", image_id: 5, timestamp: "2026-10-26T08:00:00+08:00", image: "https://images.data.gov.sg/api/traffic-images/2026/10/x.jpg", location: { latitude: 1.29, longitude: 103.87, __canary: CANARY }, image_metadata: { md5: CANARY } }, { camera_id: "1002", image: "https://evil.example.com/x.jpg", location: { latitude: 1.3, longitude: 103.8 } }] }] } },
    { from: "lta", body: LTA.cams },
  ],
  emas: [{ signs: LTA.vms, times: LTA.travel }],
  incidents: [LTA.incidents],
  "faulty-lights": [LTA.lights],
  "weather-2h": [W("2hourWeatherForecast.json", "/two-hr-forecast")],
  "forecast-24h": [W("24hourWeatherForecast.json", "/twenty-four-hr-forecast")],
  "outlook-4d": [W("4dayWeatherForecast.json", "/four-day-outlook")],
  "air-temp": [W("AirTemperatureacrossSingapore.json", "/air-temperature")],
  rainfall: [W("RainfallacrossSingapore.json", "/rainfall")],
  humidity: [W("RelativeHumidityacrossSingapore.json", "/relative-humidity")],
  wind: [{ speed: W("WindSpeedacrossSingapore.json", "/wind-speed"), direction: W("WindDirectionacrossSingapore.json", "/wind-direction") }],
  psi: [W("PollutantStandardsIndexPSI.json", "/psi")],
  pm25: [W("PM2.5.json", "/pm25")],
  uv: [W("UltravioletIndexUVI.json", "/uv")],
  wbgt: [W("WetBulbGlobeTemperatureWBGTObservations.json", "/weather")],
  lightning: [W("LightningObservation.json", "/weather")],
  flood: [W("FloodAlertsacrossSingapore.json", "/real-time/api/weather/flood-alerts")],
  radar: [W("WeatherRadarImages.json", "/weather-radar-images/70km")],
  "onemap-themes": [ONEMAP.themes],
  onemap: [ONEMAP.theme, { theme: "kindergartens" }],
};

// Every key in `v`, at every depth, except inside arrays of numbers.
function keys(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    out.add(k);
    keys(x, out);
  }
  return out;
}

test("every layer has a sample and an allow-list", () => {
  assert.deepEqual(Object.keys(LAYERS).sort(), Object.keys(ALLOW).sort());
  assert.deepEqual(Object.keys(LAYERS).sort(), Object.keys(SAMPLES).sort());
});

for (const [id, layer] of Object.entries(LAYERS)) {
  test(`${id}: trim() sends only its allow-list`, () => {
    const [raw, params = {}] = SAMPLES[id];
    // Flood alerts drop anything over 3 hours old: judged at the sample's own time.
    const now = id === "flood" ? Date.parse("2025-05-22T10:00:00+08:00") : undefined;
    const body = layer.trim(raw, params, now);
    const text = JSON.stringify(body);
    assert.ok(!text.includes(CANARY), `${id} let an unasked-for field through`);
    assert.ok(!text.includes("x-amz-security-token=abc") || id === "traffic-cams", `${id} passed a signed link on`);
    assert.ok(!text.includes("evil.example.com"), `${id} passed on a link to an unexpected host`);
    const allowed = new Set([...TOP, ...ALLOW[id]]);
    for (const k of keys(body)) assert.ok(allowed.has(k), `${id} sent "${k}", which isn't on its allow-list`);
    assert.ok(Number.isFinite(body.at), `${id} has no time`);
    const n = (body.items?.length || 0) + (body.points?.length || 0) + (body.days?.length || 0) + (body.themes?.length || 0) + (body.image ? 1 : 0);
    assert.ok(n > 0, `${id} trimmed its sample down to nothing`);
  });
}

test("a reply's raw upstream envelope never comes back whole", () => {
  const raw = fromDocs("2hourWeatherForecast.json", "/two-hr-forecast");
  const body = LAYERS["weather-2h"].trim(raw.data);
  assert.equal(body.code, undefined);
  assert.equal(body.errorMsg, undefined);
  assert.equal(body.area_metadata, undefined);
});
