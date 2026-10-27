// A local server for main-site with made-up layer data in place of /api, for working on the map
// without any API keys and for the screenshots (scripts/screenshots.mjs). Every /api/layer reply
// is invented here, in the trimmed shape the real routes send, and placed round the real MRT
// stations so it lands on the island. Nothing here calls LTA, data.gov.sg or OneMap.
//
// Run: node scripts/serve-stub.mjs [port]   then open http://localhost:4173

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "main-site");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".xml": "application/xml", ".txt": "text/plain",
};

// The same random numbers every run, so the screenshots don't change between runs.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stations = JSON.parse(readFileSync(join(SITE, "data/rail-stations.json"), "utf8")).stations;
const areas = JSON.parse(readFileSync(join(SITE, "data/planning-areas.json"), "utf8")).areas;
const round = (n) => Math.round(n * 1e5) / 1e5;

// `count` points within `metres` of the stations.
function near(count, metres, seed) {
  const r = rng(seed);
  return Array.from({ length: count }, () => {
    const s = stations[Math.floor(r() * stations.length)];
    const d = (metres * Math.sqrt(r())) / 111000;
    const a = r() * 2 * Math.PI;
    return { lat: round(s.lat + d * Math.cos(a)), lng: round(s.lng + (d * Math.sin(a)) / Math.cos((s.lat * Math.PI) / 180)) };
  });
}

// The middle of each planning area's biggest outline, for the forecasts.
const towns = areas.map((a) => {
  const ring = a.polygons.map((p) => p[0]).sort((x, y) => y.length - x.length)[0];
  const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return { name: a.name.replace(/\b\w/g, (c) => c.toUpperCase()), lat: round(lat), lng: round(lng) };
});

const now = Date.now();
const FORECASTS = ["Partly Cloudy (Day)", "Fair (Day)", "Light Showers", "Thundery Showers", "Cloudy", "Partly Cloudy (Day)", "Fair and Warm"];
const pick = (list, r) => list[Math.floor(r() * list.length)];

const r = rng(7);
const LAYERS = {
  "bus-stops": () => ({ at: now, items: near(2400, 700, 1).map((p, i) => ({ code: String(10000 + i * 3), name: `Opp Blk ${100 + (i % 800)}`, road: "Example Rd", ...p })) }),
  carparks: () => ({ at: now, items: near(420, 600, 2).map((p, i) => ({ id: `C${i}`, name: `Blk ${200 + i} Carpark`, agency: "HDB", ...p, lots: { car: Math.floor(r() * 120) } })) }),
  taxis: () => {
    const pts = near(1800, 1500, 3).map((p) => [p.lng, p.lat]);
    return { at: now, count: pts.length, points: pts };
  },
  "taxi-stands": () => ({ at: now, items: near(120, 300, 4).map((p, i) => ({ code: `T${i}`, name: "Taxi stand", type: "Stand", barrierFree: true, ...p })) }),
  "bicycle-parking": () => ({ at: now, items: near(900, 500, 5).map((p) => ({ name: "Bicycle racks", rack: "Racks", lots: 10, sheltered: false, ...p })) }),
  "ev-chargers": () => ({ at: now, items: near(200, 800, 6).map((p) => ({ name: "EV charger", address: "Example Rd", ...p, points: 4, free: Math.floor(r() * 4) })) }),
  "traffic-cams": () => ({ at: now, items: near(60, 1200, 8).map((p, i) => ({ id: String(1700 + i), ...p, image: "/ESG-512.png", at: now })) }),
  emas: () => ({ at: now, items: near(40, 1500, 9).map((p, i) => ({ id: `amvms_${i}`, ...p, message: "PIE (TUAS) 12 MIN" })), times: [{ road: "PIE", direction: 1, towards: "TUAS", from: "BKE", to: "JURONG TOWN HALL RD", minutes: 7 }] }),
  incidents: () => ({ at: now, items: near(12, 1500, 10).map((p) => ({ type: "Vehicle breakdown", message: "(26/10)08:05 Vehicle breakdown. Avoid lane 1.", ...p })) }),
  "faulty-lights": () => ({ at: now, items: near(4, 800, 11).map((p) => ({ fault: "flashing", planned: false, message: "Flashing yellow", ...p })) }),
  "weather-2h": () => {
    const w = rng(12);
    return { at: now, valid: { start: now, end: now + 7200000, text: "8 to 10 am" }, items: towns.map((t) => ({ ...t, forecast: pick(FORECASTS, w) })) };
  },
  "forecast-24h": () => ({
    at: now,
    general: { forecast: "Thundery Showers", temperature: { low: 25, high: 33 }, humidity: { low: 60, high: 95 }, wind: { low: 10, high: 20, direction: "SSE" }, valid: { start: now, end: now + 864e5, text: "6 am today to 6 am tomorrow" } },
    periods: [{ start: now, end: now + 216e5, text: "6 am to 12 pm", regions: { north: "Cloudy", south: "Fair", east: "Light Showers", west: "Cloudy", central: "Partly Cloudy (Day)" } }],
    items: [["north", 1.41803, 103.82], ["south", 1.29587, 103.82], ["east", 1.35735, 103.94], ["west", 1.35735, 103.7], ["central", 1.35735, 103.82]].map(([region, lat, lng]) => ({ region, lat, lng, forecast: "Partly Cloudy (Day)" })),
  }),
  "outlook-4d": () => ({ at: now, items: [], days: [0, 1, 2, 3].map((d) => ({ day: "Monday", date: now + d * 864e5, forecast: "Thundery Showers", summary: "Afternoon thundery showers", temperature: { low: 25, high: 33 }, humidity: { low: 60, high: 95 }, wind: { low: 10, high: 20, direction: "S" } })) }),
  "air-temp": () => ({ at: now, unit: "deg C", items: near(14, 3000, 13).map((p, i) => ({ id: `S${100 + i}`, name: "Weather station", ...p, value: Math.round((27 + r() * 5) * 10) / 10 })) }),
  rainfall: () => ({ at: now, unit: "mm", items: near(40, 3000, 14).map((p, i) => ({ id: `S${200 + i}`, name: "Rain gauge", ...p, value: r() > 0.7 ? Math.round(r() * 30) / 10 : 0 })) }),
  humidity: () => ({ at: now, unit: "percentage", items: near(14, 3000, 15).map((p, i) => ({ id: `S${300 + i}`, name: "Weather station", ...p, value: Math.round(65 + r() * 30) })) }),
  wind: () => ({ at: now, unit: "knots", items: near(14, 3000, 16).map((p, i) => ({ id: `S${400 + i}`, name: "Weather station", ...p, speed: Math.round(r() * 120) / 10, direction: Math.floor(r() * 360) })) }),
  psi: () => ({ at: now, items: [["north", 1.41803, 103.82], ["south", 1.29587, 103.82], ["east", 1.35735, 103.94], ["west", 1.35735, 103.7], ["central", 1.35735, 103.82]].map(([region, lat, lng]) => ({ region, lat, lng, psi: 30 + Math.floor(r() * 30), pm25: 12, pm10: 20, o3: 18 })) }),
  pm25: () => ({ at: now, items: [["north", 1.41803, 103.82], ["south", 1.29587, 103.82], ["east", 1.35735, 103.94], ["west", 1.35735, 103.7], ["central", 1.35735, 103.82]].map(([region, lat, lng]) => ({ region, lat, lng, value: 8 + Math.floor(r() * 20) })) }),
  uv: () => ({ at: now, hours: [{ hour: now - 36e5, value: 5 }, { hour: now, value: 7 }], items: [{ lat: 1.35735, lng: 103.82, value: 7 }] }),
  wbgt: () => ({ at: now, items: near(10, 3000, 17).map((p, i) => ({ id: `S${500 + i}`, name: "WBGT station", town: "Town", ...p, value: Math.round((28 + r() * 4) * 10) / 10, heat: pick(["Low", "Moderate", "High"], r) })) }),
  lightning: () => ({ at: now, items: near(6, 3000, 18).map((p) => ({ ...p, at: now, kind: "cloud" })) }),
  flood: () => ({ at: now, items: [] }),
  radar: () => ({ at: now, items: [], image: null }),
  "onemap-themes": () => ({ at: now, items: [], themes: [{ q: "hawkercentre", name: "Hawker Centres", category: "Food" }, { q: "libraries", name: "Libraries", category: "Education" }, { q: "nationalparks", name: "Parks", category: "Environment" }] }),
  onemap: () => ({ at: now, theme: "hawkercentre", name: "Hawker Centres", owner: "NEA", items: near(110, 700, 19).map((p) => ({ name: "Hawker centre", description: "", address: "Example Rd", ...p })) }),
};

export function startStub(port = 4173) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const layer = url.pathname.match(/^\/api\/layer\/([a-z0-9-]+)$/);
    if (layer) {
      const make = LAYERS[layer[1]];
      res.writeHead(make ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(make ? make() : { error: "No such layer" }));
    }
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Not in the stub" }));
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path === "/" || path === "") path = "/index.html";
    let file = join(SITE, path);
    if (!file.startsWith(SITE)) {
      res.writeHead(403);
      return res.end();
    }
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end(readFileSync(join(SITE, "404.html")));
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 4173;
  await startStub(port);
  console.log(`main-site with stub layers on http://localhost:${port}`);
}
