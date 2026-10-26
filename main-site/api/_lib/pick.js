// The small pieces every layer's trim() (api/_layers/) builds its reply from: a field read as a
// number or a short string, a position checked to be in Singapore and rounded, the time a
// reading was taken. Nothing here passes a value on as it came: a string is cut to a length, a
// number has to be finite, and anything else is left out.

// Singapore and its waters, a little wider than the island: [south, west, north, east].
export const SG_BOX = [1.13, 103.55, 1.5, 104.13];
// Wider again, for lightning and the radar, which reach out to sea.
export const WIDE_BOX = [0.8, 103.2, 1.9, 104.5];

export function num(v) {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function str(v, max = 200) {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(/\s+/g, " ").trim().slice(0, max);
}

export const round = (n, dp = 5) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export function inBox(lat, lng, box = SG_BOX) {
  return lat != null && lng != null && lat >= box[0] && lat <= box[2] && lng >= box[1] && lng <= box[3];
}

// [lat, lng] rounded to about a metre, or null when it isn't in `box`.
export function position(lat, lng, box = SG_BOX) {
  const a = num(lat);
  const b = num(lng);
  return inBox(a, b, box) ? [round(a), round(b)] : null;
}

// "1.29375 103.85718", as LTA's carpark Location and OneMap's LatLng ("1.3,103.8") write them.
export function positionText(text, box = SG_BOX) {
  const [a, b] = String(text || "").split(/[\s,]+/).filter(Boolean);
  return position(a, b, box);
}

// A time as epoch milliseconds, or null.
export function time(v) {
  const t = typeof v === "number" ? v : Date.parse(String(v || ""));
  return Number.isFinite(t) && t > 0 ? t : null;
}

// Only https links on hosts we expect, so a reply never carries a link somewhere else.
export function safeUrl(v, hosts) {
  try {
    const u = new URL(String(v));
    if (u.protocol !== "https:") return null;
    return hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.href : null;
  } catch {
    return null;
  }
}

// SVY21, Singapore's grid (metres north and east), to WGS84 latitude and longitude, for LTA's
// faulty traffic lights. SLA's published transverse Mercator parameters.
const SVY = {
  a: 6378137,
  f: 1 / 298.257223563,
  lat0: 1.366666,
  lng0: 103.833333,
  n0: 38744.572,
  e0: 28001.642,
  k: 1,
};

export function svy21ToLatLng(northing, easting) {
  const N = num(northing);
  const E = num(easting);
  if (N == null || E == null) return null;
  const { a, f, k, n0, e0 } = SVY;
  const rad = Math.PI / 180;
  const b = a * (1 - f);
  const e2 = 2 * f - f * f;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const A0 = 1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256;
  const A2 = (3 / 8) * (e2 + e4 / 4 + (15 * e6) / 128);
  const A4 = (15 / 256) * (e4 + (3 * e6) / 4);
  const A6 = (35 * e6) / 3072;
  const meridian = (lat) => a * (A0 * lat - A2 * Math.sin(2 * lat) + A4 * Math.sin(4 * lat) - A6 * Math.sin(6 * lat));
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n2 * n2;
  const G = a * (1 - n) * (1 - n2) * (1 + (9 * n2) / 4 + (225 * n4) / 64) * rad;
  const Mprime = meridian(SVY.lat0 * rad) + (N - n0) / k;
  const sigma = ((Mprime / G) * Math.PI) / 180;
  const latPrime =
    sigma +
    ((3 * n) / 2 - (27 * n3) / 32) * Math.sin(2 * sigma) +
    ((21 * n2) / 16 - (55 * n4) / 32) * Math.sin(4 * sigma) +
    ((151 * n3) / 96) * Math.sin(6 * sigma) +
    ((1097 * n4) / 512) * Math.sin(8 * sigma);
  const sinLat = Math.sin(latPrime);
  const rho = (a * (1 - e2)) / (1 - e2 * sinLat * sinLat) ** 1.5;
  const v = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const psi = v / rho;
  const t = Math.tan(latPrime);
  const Eprime = E - e0;
  const x = Eprime / (k * v);
  const lat =
    latPrime -
    (t / (k * rho)) * ((x * Eprime) / 2) +
    (t / (k * rho)) * ((Eprime * x ** 3) / 24) * (-4 * psi * psi + 9 * psi * (1 - t * t) + 12 * t * t) -
    (t / (k * rho)) * ((Eprime * x ** 5) / 720) *
      (8 * psi ** 4 * (11 - 24 * t * t) - 12 * psi ** 3 * (21 - 71 * t * t) + 15 * psi * psi * (15 - 98 * t * t + 15 * t ** 4) + 180 * psi * (5 * t * t - 3 * t ** 4) + 360 * t ** 4) +
    (t / (k * rho)) * ((Eprime * x ** 7) / 40320) * (1385 - 3633 * t * t + 4095 * t ** 4 + 1575 * t ** 6);
  const secLat = 1 / Math.cos(latPrime);
  const lng =
    SVY.lng0 * rad +
    secLat * x -
    secLat * (x ** 3 / 6) * (psi + 2 * t * t) +
    secLat * (x ** 5 / 120) * (-4 * psi ** 3 * (1 - 6 * t * t) + psi * psi * (9 - 68 * t * t) + 72 * psi * t * t + 24 * t ** 4) -
    secLat * (x ** 7 / 5040) * (61 + 662 * t * t + 1320 * t ** 4 + 720 * t ** 6);
  return position(lat / rad, lng / rad);
}
