// Weather and air from NEA, through data.gov.sg's real-time API (api-open.data.gov.sg/v2): the
// forecasts, the readings at NEA's weather stations, lightning, flood alerts from PUB, heat
// stress, UV, PSI, PM2.5 and the rain radar. Each layer's shape is explained at the top of
// transport.js; maxAge follows each feed's own update rate.

import { dataGov } from "../_lib/http.js";
import { num, position, round, str, time, WIDE_BOX } from "../_lib/pick.js";

// Where NEA labels its five regions (data.gov.sg's regionMetadata gives the same points).
export const REGIONS = {
  north: [1.41803, 103.82],
  south: [1.29587, 103.82],
  east: [1.35735, 103.94],
  west: [1.35735, 103.7],
  central: [1.35735, 103.82],
};
const REGION_NAMES = Object.keys(REGIONS);

const period = (p) => ({ start: time(p?.start), end: time(p?.end), text: str(p?.text, 60) });
const range = (r) => ({ low: num(r?.low), high: num(r?.high) });

export const weather2h = {
  id: "weather-2h",
  maxAge: 600,
  load: () => dataGov("/two-hr-forecast"),
  trim(data) {
    const where = new Map();
    for (const a of Array.isArray(data?.area_metadata) ? data.area_metadata : []) {
      const at = position(a?.label_location?.latitude, a?.label_location?.longitude);
      if (at) where.set(str(a.name, 60), at);
    }
    const item = data?.items?.[0];
    const items = [];
    for (const f of Array.isArray(item?.forecasts) ? item.forecasts : []) {
      const name = str(f?.area, 60);
      const at = where.get(name);
      if (at) items.push({ name, forecast: str(f.forecast, 60), lat: at[0], lng: at[1] });
    }
    return { at: time(item?.timestamp) ?? Date.now(), valid: period(item?.valid_period), items };
  },
};

export const forecast24h = {
  id: "forecast-24h",
  maxAge: 1800,
  load: () => dataGov("/twenty-four-hr-forecast"),
  trim(data) {
    const rec = data?.records?.[0];
    const g = rec?.general || {};
    const periods = (Array.isArray(rec?.periods) ? rec.periods : []).map((p) => ({
      ...period(p?.timePeriod),
      regions: Object.fromEntries(REGION_NAMES.map((r) => [r, str(p?.regions?.[r]?.text, 60)])),
    }));
    return {
      at: time(rec?.timestamp) ?? Date.now(),
      general: {
        forecast: str(g.forecast?.text, 60),
        temperature: range(g.temperature),
        humidity: range(g.relativeHumidity),
        wind: { ...range(g.wind?.speed), direction: str(g.wind?.direction, 4) },
        valid: period(g.validPeriod),
      },
      periods,
      // The map labels each region with the period on now.
      items: REGION_NAMES.map((r) => ({ region: r, lat: REGIONS[r][0], lng: REGIONS[r][1], forecast: periods[0]?.regions?.[r] || "" })),
    };
  },
};

export const outlook4d = {
  id: "outlook-4d",
  maxAge: 3600,
  load: () => dataGov("/four-day-outlook"),
  trim(data) {
    const rec = data?.records?.[0];
    const days = (Array.isArray(rec?.forecasts) ? rec.forecasts : []).slice(0, 4).map((f) => ({
      day: str(f?.day, 10),
      date: time(f?.timestamp),
      forecast: str(f?.forecast?.text, 60),
      summary: str(f?.forecast?.summary, 120),
      temperature: range(f?.temperature),
      humidity: range(f?.relativeHumidity),
      wind: { ...range(f?.wind?.speed), direction: str(f?.wind?.direction, 4) },
    }));
    return { at: time(rec?.timestamp) ?? Date.now(), days, items: [] };
  },
};

// A station feed (air temperature, rainfall, humidity, wind): each station's latest value.
function stationValues(data) {
  const stations = new Map();
  for (const s of Array.isArray(data?.stations) ? data.stations : []) {
    const loc = s?.labelLocation || s?.location;
    const at = position(loc?.latitude, loc?.longitude);
    if (at) stations.set(str(s.id, 10), { id: str(s.id, 10), name: str(s.name, 80), lat: at[0], lng: at[1] });
  }
  const reading = data?.readings?.[0];
  const values = new Map();
  for (const d of Array.isArray(reading?.data) ? reading.data : []) {
    const v = num(d?.value);
    if (v != null) values.set(str(d.stationId, 10), v);
  }
  return { at: time(reading?.timestamp) ?? Date.now(), unit: str(data?.readingUnit, 20), stations, values };
}

function stationLayer(id, path, maxAge) {
  return {
    id,
    maxAge,
    load: () => dataGov(path),
    trim(data) {
      const { at, unit, stations, values } = stationValues(data);
      const items = [];
      for (const [sid, s] of stations) if (values.has(sid)) items.push({ ...s, value: round(values.get(sid), 1) });
      return { at, unit, items };
    },
  };
}

export const airTemp = stationLayer("air-temp", "/air-temperature", 120);
export const rainfall = stationLayer("rainfall", "/rainfall", 300);
export const humidity = stationLayer("humidity", "/relative-humidity", 120);

export const wind = {
  id: "wind",
  maxAge: 120,
  async load() {
    const [speed, direction] = await Promise.all([dataGov("/wind-speed"), dataGov("/wind-direction")]);
    return { speed, direction };
  },
  trim(raw) {
    const s = stationValues(raw?.speed);
    const d = stationValues(raw?.direction);
    const items = [];
    for (const [sid, st] of s.stations) {
      if (!s.values.has(sid)) continue;
      const dir = d.values.get(sid);
      items.push({ ...st, speed: round(s.values.get(sid), 1), direction: dir == null ? null : Math.round(dir) % 360 });
    }
    return { at: s.at, unit: s.unit || "knots", items };
  },
};

// The latest of each region's readings in a data.gov.sg air quality feed, for `fields`.
function regionReadings(data, fields) {
  const item = data?.items?.[0];
  const readings = item?.readings || {};
  const items = REGION_NAMES.map((r) => {
    const row = { region: r, lat: REGIONS[r][0], lng: REGIONS[r][1] };
    for (const [out, field] of Object.entries(fields)) row[out] = num(readings?.[field]?.[r]);
    return row;
  });
  return { at: time(item?.timestamp) ?? Date.now(), items };
}

export const psi = {
  id: "psi",
  maxAge: 900,
  load: () => dataGov("/psi"),
  trim: (data) =>
    regionReadings(data, { psi: "psi_twenty_four_hourly", pm25: "pm25_twenty_four_hourly", pm10: "pm10_twenty_four_hourly", o3: "o3_eight_hour_max" }),
};

export const pm25 = {
  id: "pm25",
  maxAge: 900,
  load: () => dataGov("/pm25"),
  trim: (data) => regionReadings(data, { value: "pm25_one_hourly" }),
};

export const uv = {
  id: "uv",
  maxAge: 900,
  load: () => dataGov("/uv"),
  trim(data) {
    const rec = data?.records?.[0];
    const hours = (Array.isArray(rec?.index) ? rec.index : [])
      .map((h) => ({ hour: time(h?.hour), value: num(h?.value) }))
      .filter((h) => h.hour && h.value != null)
      .sort((a, b) => a.hour - b.hour);
    const now = hours[hours.length - 1] || null;
    // One island-wide reading, shown in the middle of the island.
    return { at: time(rec?.timestamp) ?? Date.now(), hours, items: now ? [{ lat: 1.35735, lng: 103.82, value: now.value }] : [] };
  },
};

const HEAT = new Set(["Low", "Moderate", "High"]);

export const wbgt = {
  id: "wbgt",
  maxAge: 600,
  load: () => dataGov("/weather", { api: "wbgt" }),
  trim(data) {
    const rec = data?.records?.[0];
    const items = [];
    for (const r of Array.isArray(rec?.item?.readings) ? rec.item.readings : []) {
      // NEA spells it "longtitude" here.
      const at = position(r?.location?.latitude, r?.location?.longtitude ?? r?.location?.longitude);
      const value = num(r?.wbgt);
      if (!at || value == null) continue;
      const heat = str(r.heatStress, 12);
      items.push({ id: str(r.station?.id, 10), name: str(r.station?.name, 80), town: str(r.station?.townCenter, 60), lat: at[0], lng: at[1], value, heat: HEAT.has(heat) ? heat : "" });
    }
    return { at: time(rec?.datetime) ?? Date.now(), items };
  },
};

export const lightning = {
  id: "lightning",
  maxAge: 120,
  load: () => dataGov("/weather", { api: "lightning" }),
  trim(data) {
    const items = [];
    let at = null;
    for (const rec of Array.isArray(data?.records) ? data.records.slice(0, 3) : []) {
      at ??= time(rec?.datetime);
      for (const r of Array.isArray(rec?.item?.readings) ? rec.item.readings : []) {
        const p = position(r?.location?.latitude, r?.location?.longitude, WIDE_BOX);
        if (!p) continue;
        items.push({ lat: p[0], lng: p[1], at: time(r.datetime), kind: str(r.type, 2) === "G" ? "ground" : "cloud" });
      }
    }
    return { at: at ?? Date.now(), items };
  },
};

// PUB's flood alerts: each still-open alert, at the point it names. Its circle's radius is how
// far the alert was broadcast, not how far the water reaches, so only the point is kept. Alerts
// a later message cancels, and any older than STALE_MS, are left out.
const FLOOD_STALE_MS = 3 * 3600 * 1000;

export const flood = {
  id: "flood",
  maxAge: 120,
  load: () => dataGov("/weather/flood-alerts"),
  trim(data, _p, now = Date.now()) {
    const records = Array.isArray(data?.records) ? data.records : [];
    const cancelled = new Set();
    for (const rec of records) {
      if (str(rec?.item?.msgType, 10) !== "Cancel") continue;
      for (const ref of String(rec.item.references || "").split(/[\s,]+/)) if (ref) cancelled.add(ref);
    }
    const items = [];
    for (const rec of records) {
      const issued = time(rec?.datetime);
      const id = str(rec?.item?.identifier, 80);
      if (str(rec?.item?.msgType, 10) === "Cancel" || cancelled.has(id) || !issued || now - issued > FLOOD_STALE_MS) continue;
      for (const r of Array.isArray(rec.item.readings) ? rec.item.readings : []) {
        const c = Array.isArray(r?.area?.circle) ? r.area.circle : [];
        const at = position(c[0], c[1]);
        if (!at) continue;
        items.push({
          headline: str(r.headline, 80),
          description: str(r.description, 240),
          instruction: str(r.instruction, 240),
          severity: str(r.severity, 20),
          issued,
          lat: at[0],
          lng: at[1],
        });
      }
    }
    return { at: now, items };
  },
};

// The rain radar's latest picture over the 70 km range: where it goes on the map, and the
// address of its PNG through api/radar.js (data.gov.sg's own link lasts 20 minutes and has no
// CORS, which a WebGL map needs).
export const RADAR_RANGES = { "70km": "/weather-radar-images/70km", "240km": "/weather-radar-images/240km" };

export const radar = {
  id: "radar",
  maxAge: 240,
  load: () => dataGov(RADAR_RANGES["70km"]),
  trim(data) {
    const box = data?.boundaryBox;
    const rec = data?.records?.[0];
    const w = num(box?.upperLeft?.longitude);
    const n = num(box?.upperLeft?.latitude);
    const e = num(box?.lowerRight?.longitude);
    const s = num(box?.lowerRight?.latitude);
    const at = time(rec?.timestamp);
    if ([w, n, e, s].some((v) => v == null) || !at) return { at: Date.now(), items: [], image: null };
    return {
      at,
      items: [],
      image: `/api/radar?range=70km&t=${at}`,
      // MapLibre's image corners: top left, top right, bottom right, bottom left, as [lng, lat].
      corners: [[w, n], [e, n], [e, s], [w, s]].map(([x, y]) => [round(x), round(y)]),
    };
  },
};

export default [weather2h, forecast24h, outlook4d, airTemp, rainfall, humidity, wind, psi, pm25, uv, wbgt, lightning, flood, radar];
