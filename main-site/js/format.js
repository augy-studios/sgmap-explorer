// Pure helpers the layers draw with: which icon and colour a forecast or a reading gets, and
// how a time reads. No DOM and no map here, so tests/format.test.mjs runs them in Node.

// Marker colours, each dark enough for the white icon on it to clear 3:1 (WCAG's non-text
// contrast), in light and dark mode alike.
export const COLOURS = {
  green: "#1e7d45",
  teal: "#0e7480",
  blue: "#1f5fbf",
  navy: "#284b8f",
  purple: "#7b3fb5",
  magenta: "#a3307a",
  red: "#b42318",
  orange: "#b44d0c",
  amber: "#97640a",
  grey: "#4b5563",
  slate: "#475a6b",
  brown: "#7a4b25",
};

// MRT and LRT line colours, as LTA's signs use them (SG Bus Timings' map-card.js).
export const LINE_COLOURS = {
  EW: "#009645", CG: "#009645", NS: "#d42e12", NE: "#9900aa", CC: "#fa9e0d", CE: "#fa9e0d",
  DT: "#005ec4", TE: "#9d5b25", BP: "#748477", SK: "#748477", PG: "#748477", SE: "#748477",
  SW: "#748477", PE: "#748477", PW: "#748477", JS: "#0099aa", JE: "#0099aa", JW: "#0099aa", CR: "#97c616", CP: "#97c616",
};

// A station code's line: "NS10" is the North South Line's, "STC" Sengkang's.
export function lineOf(code) {
  const m = String(code || "").toUpperCase().match(/^[A-Z]+/);
  if (!m) return null;
  const c = m[0];
  if (c === "STC") return "SK";
  if (c === "PTC") return "PG";
  return c;
}

// NEA's forecast words to an icon and colour: "Thundery Showers", "Partly Cloudy (Night)", ...
export function forecastLook(text) {
  const s = String(text || "").toLowerCase();
  if (s.includes("thunder")) return { icon: "storm", colour: COLOURS.purple };
  if (s.includes("shower") || s.includes("rain") || s.includes("drizzle")) return { icon: "rain", colour: COLOURS.blue };
  if (s.includes("haz") || s.includes("mist") || s.includes("fog")) return { icon: "haze", colour: COLOURS.slate };
  if (s.includes("partly")) return { icon: "partly", colour: COLOURS.slate };
  if (s.includes("cloud") || s.includes("overcast")) return { icon: "cloud", colour: COLOURS.grey };
  if (s.includes("wind")) return { icon: "wind", colour: COLOURS.teal };
  if (s.includes("night")) return { icon: "moon", colour: COLOURS.navy };
  if (s.includes("fair") || s.includes("warm") || s.includes("sunny")) return { icon: "sun", colour: COLOURS.amber };
  return { icon: "cloud", colour: COLOURS.grey };
}

// A carpark's colour by its free car lots: plenty, a few, none or not known.
export function carparkColour(lots) {
  if (lots == null) return COLOURS.grey;
  if (lots >= 20) return COLOURS.green;
  if (lots >= 5) return COLOURS.amber;
  return COLOURS.red;
}

// NEA's PSI bands (24-hour PSI): good, moderate, unhealthy, very unhealthy, hazardous.
export function psiBand(v) {
  if (v == null) return { band: "unknown", colour: COLOURS.grey };
  if (v <= 50) return { band: "good", colour: COLOURS.green };
  if (v <= 100) return { band: "moderate", colour: COLOURS.amber };
  if (v <= 200) return { band: "unhealthy", colour: COLOURS.orange };
  if (v <= 300) return { band: "very-unhealthy", colour: COLOURS.red };
  return { band: "hazardous", colour: COLOURS.magenta };
}

// NEA's 1-hour PM2.5 bands (µg/m³): normal, elevated, high, very high.
export function pm25Band(v) {
  if (v == null) return { band: "unknown", colour: COLOURS.grey };
  if (v <= 55) return { band: "normal", colour: COLOURS.green };
  if (v <= 150) return { band: "elevated", colour: COLOURS.amber };
  if (v <= 250) return { band: "high", colour: COLOURS.orange };
  return { band: "very-high", colour: COLOURS.red };
}

// The UV index's WHO bands.
export function uvBand(v) {
  if (v == null) return { band: "unknown", colour: COLOURS.grey };
  if (v <= 2) return { band: "low", colour: COLOURS.green };
  if (v <= 5) return { band: "moderate", colour: COLOURS.amber };
  if (v <= 7) return { band: "high", colour: COLOURS.orange };
  if (v <= 10) return { band: "very-high", colour: COLOURS.red };
  return { band: "extreme", colour: COLOURS.purple };
}

export function heatColour(level) {
  return { Low: COLOURS.green, Moderate: COLOURS.amber, High: COLOURS.red }[level] || COLOURS.grey;
}

// Rainfall in the last 5 minutes, mm: none, light, moderate, heavy.
export function rainColour(mm) {
  if (!(mm > 0)) return COLOURS.grey;
  if (mm < 1) return COLOURS.teal;
  if (mm < 4) return COLOURS.blue;
  return COLOURS.purple;
}

export function tempColour(c) {
  if (c == null) return COLOURS.grey;
  if (c < 26) return COLOURS.teal;
  if (c < 30) return COLOURS.green;
  if (c < 33) return COLOURS.amber;
  return COLOURS.red;
}

// "10:42 pm", in Singapore's time, in the language on show.
export function clock(ms, locale = "en") {
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(11, 16);
  }
}

export function day(ms, locale = "en") {
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore" }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

// Where a wind arrow points: the way the wind blows to, from the direction it comes from.
export const windRotation = (from) => (Number.isFinite(from) ? (from + 180) % 360 : 0);

// A short form of a long name, for a label on the map.
export function shorten(s, max = 22) {
  const t = String(s || "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

// A point grid for asking by area: a coordinate rounded to 0.01 degrees, about a kilometre.
export const gridRound = (v) => Math.round(v * 100) / 100;
