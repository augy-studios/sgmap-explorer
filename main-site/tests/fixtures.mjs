// Upstream replies for the tests, with a canary in every object: a field no trim() asks for,
// holding CANARY, so a test can tell if any of it got through.
//
// - data.gov.sg's: built from the OpenAPI files in docs/ (the samples Augy gave), from each
//   schema's own examples. Arrays get two items.
// - LTA DataMall's: written out here from the fields in docs/LTA_DataMall_API_User_Guide.pdf.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CANARY = "CANARY-do-not-send";
const DOCS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs");

function resolve(doc, s) {
  while (s && s.$ref) s = s.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], doc);
  return s || {};
}

// An example value for a schema: its example, its first enum, or one made up for its type.
function example(doc, schema, depth = 0) {
  const s = resolve(doc, schema);
  if (depth > 12) return null;
  if (s.example !== undefined && s.type !== "object" && s.type !== "array") return s.example;
  if (s.enum) return s.enum[0];
  if (s.oneOf || s.anyOf) return example(doc, (s.oneOf || s.anyOf)[0], depth + 1);
  if (s.type === "array" || s.items) {
    if (s.example !== undefined) return s.example;
    return [example(doc, s.items || {}, depth + 1), example(doc, s.items || {}, depth + 1)];
  }
  if (s.type === "object" || s.properties) {
    const o = { __canary: CANARY };
    for (const [k, v] of Object.entries(s.properties || {})) o[k] = example(doc, v, depth + 1);
    return o;
  }
  if (s.type === "number" || s.type === "integer") return 1;
  if (s.type === "boolean") return false;
  if (s.format === "date-time") return "2026-10-26T08:00:00+08:00";
  return "text";
}

// The 200 reply data.gov.sg's docs describe for `path` in docs/`file`.
export function fromDocs(file, path) {
  const doc = JSON.parse(readFileSync(join(DOCS, file), "utf8"));
  const op = doc.paths[path].get;
  const content = resolve(doc, op.responses["200"]).content;
  const media = Object.values(content)[0];
  return example(doc, media.schema);
}

// The v2 API's `data` (http.js's dataGov() hands a layer that, not the envelope).
export const dgsData = (file, path) => fromDocs(file, path).data;

const c = { __canary: CANARY };

export const LTA = {
  busStops: [
    { ...c, BusStopCode: "01012", RoadName: "Victoria St", Description: "Hotel Grand Pacific", Latitude: 1.29685, Longitude: 103.853 },
    { ...c, BusStopCode: "99999", RoadName: "Nowhere", Description: "Off the map", Latitude: 0, Longitude: 0 },
  ],
  carparks: [
    { ...c, CarParkID: "1", Area: "Marina", Development: "Suntec City", Location: "1.29375 103.85718", AvailableLots: 352, LotType: "C", Agency: "LTA" },
    { ...c, CarParkID: "1", Area: "Marina", Development: "Suntec City", Location: "1.29375 103.85718", AvailableLots: 12, LotType: "Y", Agency: "LTA" },
    { ...c, CarParkID: "KB7", Area: "", Development: "BLK 69 GEYLANG BAHRU", Location: "1.32158 103.87047", AvailableLots: 18, LotType: "C", Agency: "HDB" },
  ],
  taxiStands: [{ ...c, TaxiCode: "A01", Latitude: 1.303980684, Longitude: 103.9191828, Bfa: "Yes", Ownership: "LTA", Type: "Stand", Name: "Orchard Rd along driveway of Lucky Plaza" }],
  bicycle: [{ ...c, Description: "Bus Stop 43267", Latitude: 1.3927176, Longitude: 103.8261826, RackType: "Yellow Box", RackCount: 10, ShelterIndicator: "Y" }],
  vms: [{ ...c, EquipmentID: "amvms_v9104", Latitude: 1.3927176306916775, Longitude: 103.82618266340947, Message: "VEH BREAKDOWN SH,AFT U.THOMSON" }],
  travel: [{ ...c, Name: "AYE", Direction: 1, FarEndPoint: "TUAS CHECKPOINT", StartPoint: "AYE/MCE INTERCHANGE", EndPoint: "TELOK BLANGAH RD", EstTime: 2 }],
  incidents: [{ ...c, Type: "Vehicle breakdown", Latitude: 1.30398068448214, Longitude: 103.919182834377, Message: "(29/3)18:22 Vehicle breakdown on ECP" }],
  lights: [{ ...c, AlarmID: "GL703034136", NodeID: "703034136", Type: 13, StartDate: "2014-04-12 01:58:00.0", EndDate: "", XCoordinate: 20786.6, YCoordinate: 32521.5, Message: "(23/1) 8:58 Flashing Yellow" }],
  taxis: [{ ...c, Latitude: 1.35667, Longitude: 103.93314 }],
  cams: [{ ...c, CameraID: "5795", Latitude: 1.326024822, Longitude: 103.905625, ImageLink: "https://dm-traffic-camera-itsc.s3.amazonaws.com/2020-04-01/1001.jpg?x-amz-security-token=abc" }],
  ev: [{
    ...c, address: "123 Road A Singapore 123456", name: "123 Road A", longtitude: 103.85, latitude: 1.3, locationId: "1", status: "1",
    chargingPoints: [{ ...c, status: "1", operator: "EVCO A", plugTypes: [{ ...c, plugType: "Type 2", price: "0.70", evIds: [{ ...c, id: "x", evCpId: "R123456A-001", status: "1" }, { ...c, status: "0" }] }] }],
  }],
};

// OneMap's themes, in the shape onemapsgapi (CRAN) reads them.
export const ONEMAP = {
  themes: { Theme_Names: [{ ...c, THEMENAME: "Kindergartens", QUERYNAME: "kindergartens", ICON: "x.jpg", CATEGORY: "Education", THEME_OWNER: "ECDA" }] },
  theme: {
    SrchResults: [
      { ...c, FeatCount: 1, Theme_Name: "Kindergartens", Category: "Education", Owner: "ECDA" },
      { ...c, NAME: "Little Ones", DESCRIPTION: "Kindergarten", ADDRESSPOSTALCODE: "123456", ADDRESSSTREETNAME: "Road A", ADDRESSBLOCKHOUSENUMBER: "1", LatLng: "1.3,103.8", ICON_NAME: "k.jpg", Type: "Point" },
    ],
  },
};
