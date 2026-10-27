// Getting around: bus stops, carparks, taxis and taxi stands, bicycle parking and EV chargers,
// from LTA DataMall (and data.gov.sg for the taxis). Each layer is
//
//   { id, maxAge, load(params), trim(raw, params), params?(query), snapshot?, sweep? }
//
// load() fetches from upstream; trim() builds the reply from it, an allow-list of fields per
// item, so nothing else LTA sends reaches the browser. maxAge is how long Vercel's edge keeps a
// reply (Cache-Control s-maxage), set to how often the feed itself changes. A `snapshot` layer
// is kept in Supabase by the cron (api/cron.js) and served from there while it's fresh.

import { dataGovV1, lta, ltaAll, UpstreamError, hasLtaKey } from "../_lib/http.js";
import { num, position, positionText, round, str, time } from "../_lib/pick.js";

const DAY = 24 * 3600 * 1000;

export const busStops = {
  id: "bus-stops",
  maxAge: 86400,
  snapshot: { maxAgeMs: 2 * DAY },
  load: () => ltaAll("/BusStops"),
  trim(rows) {
    const items = [];
    for (const s of rows || []) {
      const at = position(s?.Latitude, s?.Longitude);
      const code = str(s?.BusStopCode, 5);
      if (!at || !/^\d{5}$/.test(code)) continue;
      items.push({ code, name: str(s.Description, 80), road: str(s.RoadName, 80), lat: at[0], lng: at[1] });
    }
    return { at: Date.now(), items };
  },
};

const LOT_TYPES = { C: "car", Y: "motorcycle", H: "heavy" };
const AGENCIES = new Set(["HDB", "LTA", "URA"]);

export const carparks = {
  id: "carparks",
  maxAge: 60,
  load: () => ltaAll("/CarParkAvailabilityv2"),
  // One item per carpark, its lot types' free lots side by side.
  trim(rows) {
    const byId = new Map();
    for (const r of rows || []) {
      const id = str(r?.CarParkID, 20);
      const at = positionText(r?.Location);
      const type = LOT_TYPES[str(r?.LotType, 2)];
      const lots = num(r?.AvailableLots);
      if (!id || !at || !type) continue;
      const agency = AGENCIES.has(str(r.Agency, 4)) ? str(r.Agency, 4) : "";
      const key = `${agency}:${id}`;
      if (!byId.has(key)) byId.set(key, { id, name: str(r.Development, 80), agency, lat: at[0], lng: at[1], lots: {} });
      if (lots != null && lots >= 0) byId.get(key).lots[type] = lots;
    }
    return { at: Date.now(), items: [...byId.values()] };
  },
};

export const taxis = {
  id: "taxis",
  maxAge: 60,
  // data.gov.sg's copy of LTA's feed is one request; LTA's own is several pages, so it's the
  // fallback when data.gov.sg doesn't answer.
  async load() {
    try {
      return { from: "dgs", body: await dataGovV1("/transport/taxi-availability") };
    } catch (err) {
      if (!hasLtaKey()) throw err;
      return { from: "lta", body: await ltaAll("/Taxi-Availability") };
    }
  },
  trim(raw) {
    const points = [];
    let at = null;
    if (raw?.from === "dgs") {
      const f = raw.body?.features?.[0];
      at = time(f?.properties?.timestamp);
      for (const c of Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : []) {
        const p = Array.isArray(c) ? position(c[1], c[0]) : null;
        if (p) points.push([p[1], p[0]]);
      }
    } else {
      for (const t of Array.isArray(raw?.body) ? raw.body : []) {
        const p = position(t?.Latitude, t?.Longitude);
        if (p) points.push([p[1], p[0]]);
      }
    }
    // [lng, lat] pairs: a few thousand of them, kept as short as they go.
    return { at: at ?? Date.now(), count: points.length, points };
  },
};

export const taxiStands = {
  id: "taxi-stands",
  maxAge: 86400,
  snapshot: { maxAgeMs: 7 * DAY },
  load: () => ltaAll("/TaxiStands"),
  trim(rows) {
    const items = [];
    for (const r of rows || []) {
      const at = position(r?.Latitude, r?.Longitude);
      if (!at) continue;
      items.push({
        code: str(r.TaxiCode, 12),
        name: str(r.Name, 120),
        type: str(r.Type, 10) === "Stop" ? "Stop" : "Stand",
        barrierFree: str(r.Bfa, 4).toLowerCase() === "yes",
        lat: at[0],
        lng: at[1],
      });
    }
    return { at: Date.now(), items };
  },
};

// Bicycle parking. LTA answers only for a circle round a point, so the whole island is gathered
// by sweep(), a grid of circles, from the weekly cron into Supabase. Until that's there (or with
// no Supabase), the map asks for the area in view instead: ?lat=&lng= rounded to 0.01 degrees,
// within BIKE_RADIUS_KM.
const BIKE_RADIUS_KM = 1.5;
// A grid of points 2 km apart covers every spot within 1.5 km of one of them.
const SWEEP_STEP = 0.018;
const SWEEP_BOX = [1.2, 103.6, 1.47, 104.05];

function bikeItems(rows, into = new Map()) {
  for (const r of rows || []) {
    const at = position(r?.Latitude, r?.Longitude);
    if (!at) continue;
    const key = `${at[0]},${at[1]}`;
    if (into.has(key)) continue;
    into.set(key, {
      name: str(r.Description, 120),
      rack: str(r.RackType, 40),
      lots: num(r.RackCount),
      sheltered: str(r.ShelterIndicator, 2) === "Y",
      lat: at[0],
      lng: at[1],
    });
  }
  return into;
}

export const bicycleParking = {
  id: "bicycle-parking",
  maxAge: 86400,
  snapshot: { maxAgeMs: 10 * DAY, onlyWithout: ["lat", "lng"] },
  params(q) {
    if (q.lat == null && q.lng == null) return {};
    const lat = num(q.lat);
    const lng = num(q.lng);
    if (!position(lat, lng)) throw new UpstreamError("lat and lng must be a point in Singapore", 400);
    return { lat: round(lat, 2), lng: round(lng, 2) };
  },
  async load(p) {
    // The whole island is only ever the snapshot's; without one, the caller is told to ask by area.
    if (p.lat == null) return null;
    return lta("/BicycleParkingv2", { Lat: p.lat, Long: p.lng, Dist: BIKE_RADIUS_KM });
  },
  trim(rows, p = {}) {
    if (rows == null) return { at: Date.now(), byArea: true, items: [] };
    return { at: Date.now(), ...(p.lat != null && { area: [p.lat, p.lng, BIKE_RADIUS_KM] }), items: [...bikeItems(rows).values()] };
  },
  // The whole island, for the cron: every grid point's circle, 6 at a time.
  async sweep() {
    const points = [];
    for (let lat = SWEEP_BOX[0]; lat <= SWEEP_BOX[2]; lat += SWEEP_STEP) {
      for (let lng = SWEEP_BOX[1]; lng <= SWEEP_BOX[3]; lng += SWEEP_STEP) points.push([round(lat, 4), round(lng, 4)]);
    }
    const found = new Map();
    let failed = 0;
    for (let i = 0; i < points.length; i += 6) {
      const pages = await Promise.all(
        points.slice(i, i + 6).map(([lat, lng]) => lta("/BicycleParkingv2", { Lat: lat, Long: lng, Dist: BIKE_RADIUS_KM }).catch(() => {
          failed++;
          return [];
        }))
      );
      for (const rows of pages) bikeItems(rows, found);
    }
    if (failed > points.length / 4) throw new UpstreamError(`${failed} of ${points.length} bicycle parking areas didn't answer`);
    return { at: Date.now(), items: [...found.values()] };
  },
};

// EV chargers: LTA's batch file, every charger on the island in one, behind a link that lasts
// 15 minutes. Each location is kept with how many of its points are free.
const EV_HOSTS = ["amazonaws.com"];

export const evChargers = {
  id: "ev-chargers",
  maxAge: 300,
  async load() {
    const [first] = await lta("/EVCBatch");
    const link = typeof first?.Link === "string" ? first.Link : null;
    if (!link || !EV_HOSTS.some((h) => new URL(link).hostname.endsWith(h))) throw new UpstreamError("LTA's EV batch gave no file");
    const r = await fetch(link, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new UpstreamError(`LTA's EV batch file replied ${r.status}`);
    return r.json();
  },
  trim(raw) {
    // The file's list, wherever it keeps it.
    const list = Array.isArray(raw) ? raw : raw?.value || raw?.evLocationsData || raw?.data || [];
    const items = [];
    for (const loc of Array.isArray(list) ? list : []) {
      const at = position(loc?.latitude, loc?.longtitude ?? loc?.longitude);
      if (!at) continue;
      let total = 0;
      let free = 0;
      for (const cp of Array.isArray(loc.chargingPoints) ? loc.chargingPoints : []) {
        for (const plug of Array.isArray(cp?.plugTypes) ? cp.plugTypes : []) {
          for (const ev of Array.isArray(plug?.evIds) ? plug.evIds : []) {
            total++;
            if (String(ev?.status) === "1") free++;
          }
        }
      }
      items.push({ name: str(loc.name, 120), address: str(loc.address, 160), lat: at[0], lng: at[1], points: total, free });
    }
    return { at: Date.now(), items };
  },
};

export default [busStops, carparks, taxis, taxiStands, bicycleParking, evChargers];
