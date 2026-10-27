// The roads: traffic cameras, the EMAS signs over the expressways and their travel times,
// traffic incidents and faulty traffic lights, from LTA DataMall (and data.gov.sg's copy of the
// cameras). Each layer's shape is explained at the top of transport.js.

import { dataGovV1, hasLtaKey, lta, ltaAll } from "../_lib/http.js";
import { num, position, safeUrl, str, svy21ToLatLng, time } from "../_lib/pick.js";

// Where the cameras' pictures are kept: data.gov.sg's, and LTA's S3 bucket behind both.
const IMAGE_HOSTS = ["images.data.gov.sg", "amazonaws.com"];

export const trafficCams = {
  id: "traffic-cams",
  maxAge: 60,
  async load() {
    try {
      return { from: "dgs", body: await dataGovV1("/transport/traffic-images") };
    } catch (err) {
      if (!hasLtaKey()) throw err;
      return { from: "lta", body: await lta("/Traffic-Imagesv2") };
    }
  },
  trim(raw) {
    const items = [];
    if (raw?.from === "dgs") {
      const item = raw.body?.items?.[0];
      for (const c of Array.isArray(item?.cameras) ? item.cameras : []) {
        const at = position(c?.location?.latitude, c?.location?.longitude);
        const image = safeUrl(c?.image, IMAGE_HOSTS);
        if (!at || !image) continue;
        items.push({ id: str(c.camera_id, 10), lat: at[0], lng: at[1], image, at: time(c.timestamp) });
      }
      return { at: time(item?.timestamp) ?? Date.now(), items };
    }
    for (const c of Array.isArray(raw?.body) ? raw.body : []) {
      const at = position(c?.Latitude, c?.Longitude);
      const image = safeUrl(c?.ImageLink, IMAGE_HOSTS);
      if (!at || !image) continue;
      items.push({ id: str(c.CameraID, 10), lat: at[0], lng: at[1], image, at: null });
    }
    return { at: Date.now(), items };
  },
};

// EMAS: the signboards along the expressways (LTA's VMS feed), what each shows now, and the
// estimated travel times the expressway signs count down in minutes (EstTravelTimes). The travel
// times come per expressway, direction and stretch, without positions, so they go with the
// layer as a list rather than on the map.
export const emas = {
  id: "emas",
  maxAge: 120,
  async load() {
    const [signs, times] = await Promise.all([lta("/VMS"), ltaAll("/EstTravelTimes").catch(() => [])]);
    return { signs, times };
  },
  trim(raw) {
    const items = [];
    for (const s of Array.isArray(raw?.signs) ? raw.signs : []) {
      const at = position(s?.Latitude, s?.Longitude);
      if (!at) continue;
      items.push({ id: str(s.EquipmentID, 30), lat: at[0], lng: at[1], message: str(s.Message, 200) });
    }
    const times = [];
    for (const t of Array.isArray(raw?.times) ? raw.times : []) {
      const minutes = num(t?.EstTime);
      const road = str(t?.Name, 10);
      if (!road || minutes == null) continue;
      times.push({
        road,
        direction: num(t.Direction) === 2 ? 2 : 1,
        towards: str(t.FarEndPoint, 60),
        from: str(t.StartPoint, 60),
        to: str(t.EndPoint, 60),
        minutes,
      });
    }
    return { at: Date.now(), items, times };
  },
};

const INCIDENT_TYPES = new Set([
  "Accident", "Roadwork", "Vehicle breakdown", "Weather", "Obstacle", "Road Block", "Heavy Traffic",
  "Miscellaneous", "Diversion", "Unattended Vehicle", "Fire", "Plant Failure", "Reverse Flow",
]);

export const incidents = {
  id: "incidents",
  maxAge: 120,
  load: () => ltaAll("/TrafficIncidents"),
  trim(rows) {
    const items = [];
    for (const r of rows || []) {
      const at = position(r?.Latitude, r?.Longitude);
      if (!at) continue;
      const type = str(r.Type, 30);
      items.push({ type: INCIDENT_TYPES.has(type) ? type : "Miscellaneous", message: str(r.Message, 240), lat: at[0], lng: at[1] });
    }
    return { at: Date.now(), items };
  },
};

const LIGHT_FAULTS = { 4: "blackout", 13: "flashing" };

export const faultyLights = {
  id: "faulty-lights",
  maxAge: 120,
  load: () => ltaAll("/v2/FaultyTrafficLights"),
  trim(rows) {
    const items = [];
    for (const r of rows || []) {
      // SVY21: X is the easting, Y the northing.
      const at = svy21ToLatLng(r?.YCoordinate, r?.XCoordinate);
      if (!at) continue;
      items.push({
        fault: LIGHT_FAULTS[num(r.Type)] || "fault",
        planned: Boolean(str(r.EndDate, 30)),
        message: str(r.Message, 200),
        lat: at[0],
        lng: at[1],
      });
    }
    return { at: Date.now(), items };
  },
};

export default [trafficCams, emas, incidents, faultyLights];
