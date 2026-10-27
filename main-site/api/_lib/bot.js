// What the Telegram bot says (api/telegram/webhook.js): each command's reply, built from the map's
// own layers (api/_layers/, the same trimmed data the map gets), as { markdown, fallback, button }
// for sendRichTelegram, or { text, button } for a one-line plain reply. The button opens the map
// at the spot, with the layer the reply is about turned on.
//
//   /start, /help       what the bot does
//   /weather <place>    NEA's 2-hour forecast there (no place: every town)
//   /rain <place>       whether the rain gauges near there have rain (no place: where it's raining)
//   /psi                air quality by region
//   /carpark <place>    the nearest carparks with free car lots
//   /link [place]       a link to the map (at the place; or send a location in reply to it)
//   a location          the forecast and the rain where it was sent from
//
// /link is a placeholder until Augy says what he meant by it: kept to one small function, link(),
// so it's easy to change.

import { LAYERS } from "../_layers/index.js";
import { searchPlace } from "./onemap.js";
import { mapLink, SITE_URL } from "./site.js";
import { escapeMd, richTable } from "./telegram.js";

const MEMO_MS = 60_000;
const memo = new Map(); // layer id -> { at, body }

// A layer's reply, as /api/layer/<id> would send it, kept a minute per instance.
export async function layer(id) {
  const kept = memo.get(id);
  if (kept && Date.now() - kept.at < MEMO_MS) return kept.body;
  const l = LAYERS[id];
  const body = l.trim(await l.load({}), {});
  memo.set(id, { at: Date.now(), body });
  return body;
}
export const forgetLayers = () => memo.clear();

export function metres(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const nearest = (items, at) => items.map((it) => ({ ...it, d: metres(at, it) })).sort((x, y) => x.d - y.d);
const distance = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const sgTime = (ms) => (ms ? new Date(ms).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" }) : "");
const button = (text, link) => ({ text, url: mapLink(link) });

// ---------- help ----------

export function help() {
  const markdown = [
    "# SG Map Explorer",
    "",
    escapeMd("Singapore's weather, rain, air and carparks, from the same live data as the map."),
    "",
    "## Commands",
    "",
    richTable(["What it does", "Try"], [
      ["/weather", "The 2-hour forecast for a place", "/weather Tampines"],
      ["/rain", "Is it raining near a place", "/rain Bishan"],
      ["/psi", "Air quality by region now", "/psi"],
      ["/carpark", "The nearest carparks with free lots", "/carpark Bugis"],
      ["/link", "A link to the map, at a place", "/link Bishan"],
      ["/start", "Start, with this list", "/start"],
      ["/help", "This list", "/help"],
    ]),
    "",
    "## Tip",
    "",
    escapeMd("Send your location (the paperclip, then Location) for the forecast and the rain where you are."),
  ].join("\n");
  const fallback =
    "SG Map Explorer: Singapore's weather, rain, air and carparks, from the same live data as the map.\n\n" +
    "/weather <place>: the 2-hour forecast there\n/rain <place>: is it raining near there\n/psi: air quality by region\n" +
    "/carpark <place>: the nearest carparks with free lots\n/link <place>: a link to the map there\n/start, /help: this list\n\n" +
    "Or send your location for the forecast and the rain where you are.";
  return { markdown, fallback, button: { text: "Open the map", url: `${SITE_URL}/` } };
}

// ---------- where ----------

// A place's position: a town NEA forecasts for, by name, or else OneMap's search.
async function where(text, towns = []) {
  const q = text.trim().toLowerCase();
  const town = towns.find((t) => t.name.toLowerCase() === q) || towns.find((t) => t.name.toLowerCase().startsWith(q));
  if (town) return { name: town.name, lat: town.lat, lng: town.lng };
  return searchPlace(text);
}

const notFound = (text) => ({ text: `Couldn't find "${text.slice(0, 60)}". Try a road, a building, a town or a postal code.` });
const sourceDown = (what) => ({ text: `${what} didn't answer just now. Try again in a minute.` });

// ---------- /weather ----------

export async function weather(arg) {
  let w;
  try {
    w = await layer("weather-2h");
  } catch {
    return sourceDown("NEA's forecast");
  }
  const valid = w.valid?.text ? `, ${w.valid.text}` : "";
  if (!arg) {
    const rows = [...w.items].sort((a, b) => a.name.localeCompare(b.name)).map((a) => [a.name, a.forecast]);
    return {
      markdown: [`## 2-hour forecast${escapeMd(valid)}`, "", richTable(["Forecast"], rows), "", escapeMd("Send /weather and a place for one town.")].join("\n"),
      fallback: `2-hour forecast${valid}:\n${rows.map(([n, f]) => `${n}: ${f}`).join("\n")}`,
      button: button("Open the forecast map", { lat: 1.3521, lng: 103.8198, z: 11, layers: ["weather-2h"] }),
    };
  }
  let at;
  try {
    at = await where(arg, w.items);
  } catch {
    return sourceDown("OneMap's search");
  }
  if (!at) return notFound(arg);
  return forecastAt(w, at);
}

function forecastAt(w, at) {
  const area = nearest(w.items, at)[0];
  if (!area) return sourceDown("NEA's forecast");
  const near = !at.name || area.name.toLowerCase() === at.name.toLowerCase() ? "" : ` (the nearest NEA area to ${at.name})`;
  const valid = w.valid?.text || "the next 2 hours";
  return {
    markdown: [`## ${escapeMd(area.name)}`, "", `**${escapeMd(area.forecast)}**`, "", escapeMd(`For ${valid}${near}.`)].join("\n"),
    fallback: `${area.name}: ${area.forecast}, for ${valid}${near}.`,
    button: button("Open the map here", { lat: at.lat, lng: at.lng, z: 14, layers: ["weather-2h"] }),
  };
}

// ---------- /rain ----------

const RAIN_NEAR_M = 6000;

export async function rain(arg, located = null) {
  let r;
  try {
    r = await layer("rainfall");
  } catch {
    return sourceDown("NEA's rain gauges");
  }
  const time = sgTime(r.at);
  if (!arg && !located) {
    const wet = r.items.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
    if (!wet.length) {
      return { text: `No rain at any of NEA's ${r.items.length} rain gauges${time ? ` at ${time}` : ""}.`, button: button("Open the rain map", { lat: 1.3521, lng: 103.8198, z: 11, layers: ["rainfall", "radar"] }) };
    }
    const rows = wet.slice(0, 15).map((s) => [s.name, `${s.value} mm`]);
    return {
      markdown: [`## Raining at ${wet.length} of ${r.items.length} gauges`, "", escapeMd(`Rain in the 5 minutes to ${time}.`), "", richTable(["Rain"], rows)].join("\n"),
      fallback: `Raining at ${wet.length} of ${r.items.length} gauges, in the 5 minutes to ${time}:\n${rows.map(([n, v]) => `${n}: ${v}`).join("\n")}`,
      button: button("Open the rain map", { lat: 1.3521, lng: 103.8198, z: 11, layers: ["rainfall", "radar"] }),
    };
  }
  let at = located;
  if (!at) {
    try {
      // A town NEA forecasts for is found by its name, without asking OneMap.
      const towns = (await layer("weather-2h").catch(() => null))?.items || [];
      at = await where(arg, towns);
    } catch {
      return sourceDown("OneMap's search");
    }
    if (!at) return notFound(arg);
  }
  const close = nearest(r.items, at).filter((s) => s.d <= RAIN_NEAR_M).slice(0, 4);
  const name = at.name || "you";
  if (!close.length) return { text: `No rain gauge within ${RAIN_NEAR_M / 1000} km of ${name}.` };
  const raining = close.some((s) => s.value > 0);
  const verdict = raining ? `Raining near ${name}` : `No rain near ${name}`;
  const rows = close.map((s) => [s.name, `${s.value} mm`, distance(s.d)]);
  return {
    markdown: [`## ${escapeMd(verdict)}`, "", escapeMd(`The nearest rain gauges, in the 5 minutes to ${time}.`), "", richTable(["Rain", "Away"], rows)].join("\n"),
    fallback: `${verdict}. The nearest rain gauges, in the 5 minutes to ${time}:\n${rows.map(([n, v, d]) => `${n}: ${v}, ${d} away`).join("\n")}`,
    button: button("Open the rain map here", { lat: at.lat, lng: at.lng, z: 13, layers: ["rainfall", "radar"] }),
  };
}

// ---------- /psi ----------

const PSI_BANDS = [[50, "Good"], [100, "Moderate"], [200, "Unhealthy"], [300, "Very unhealthy"], [Infinity, "Hazardous"]];
export const psiWord = (v) => (v == null ? "" : PSI_BANDS.find(([max]) => v <= max)[1]);
const REGION = { north: "North", south: "South", east: "East", west: "West", central: "Central" };

export async function psi() {
  let p;
  let pm = null;
  try {
    [p, pm] = await Promise.all([layer("psi"), layer("pm25").catch(() => null)]);
  } catch {
    return sourceDown("NEA's air quality readings");
  }
  const pmOf = (region) => pm?.items?.find((x) => x.region === region)?.value;
  const rows = p.items.map((r) => [REGION[r.region] || r.region, r.psi == null ? "" : String(r.psi), psiWord(r.psi), pmOf(r.region) == null ? "" : `${pmOf(r.region)} µg/m³`]);
  const time = sgTime(p.at);
  return {
    markdown: ["## Air quality", "", escapeMd(`24-hour PSI and 1-hour PM2.5 at ${time}.`), "", richTable(["PSI", "Band", "PM2.5"], rows)].join("\n"),
    fallback: `Air quality at ${time} (24-hour PSI, 1-hour PM2.5):\n${rows.map(([r, v, b, m]) => `${r}: PSI ${v} ${b}${m ? `, PM2.5 ${m}` : ""}`).join("\n")}`,
    button: button("Open the air map", { lat: 1.3521, lng: 103.8198, z: 11, layers: ["psi", "pm25"] }),
  };
}

// ---------- /carpark ----------

const CARPARK_NEAR_M = 2000;

export async function carpark(arg) {
  if (!arg) return { text: "Send /carpark and a place, like /carpark Bugis or /carpark 238801." };
  let at;
  try {
    at = await where(arg);
  } catch {
    return sourceDown("OneMap's search");
  }
  if (!at) return notFound(arg);
  let c;
  try {
    c = await layer("carparks");
  } catch {
    return sourceDown("LTA's carpark feed");
  }
  const free = nearest(c.items.filter((x) => x.lots?.car > 0), at).filter((x) => x.d <= CARPARK_NEAR_M).slice(0, 5);
  const link = button("Open the carparks here", { lat: at.lat, lng: at.lng, z: 16, layers: ["carparks"] });
  if (!free.length) return { text: `No carpark with free car lots within ${CARPARK_NEAR_M / 1000} km of ${at.name}.`, button: link };
  const rows = free.map((x) => [x.name || x.id, String(x.lots.car), distance(x.d), x.agency]);
  return {
    markdown: [`## Carparks near ${escapeMd(at.name)}`, "", escapeMd(`Free car lots at ${sgTime(c.at)}, nearest first.`), "", richTable(["Free lots", "Away", "By"], rows)].join("\n"),
    fallback: `Carparks near ${at.name}, free car lots at ${sgTime(c.at)}:\n${rows.map(([n, l, d, a]) => `${n}: ${l} free, ${d} away${a ? ` (${a})` : ""}`).join("\n")}`,
    button: link,
  };
}

// ---------- /link ----------

// A link to the map: the whole island, or at a place, or at a location sent in reply to the
// bot. One plain line and a button.
export async function link(arg, at = null) {
  if (!arg && !at) {
    return {
      text: `The map: ${SITE_URL}/\nSend /link and a place for a link to there, or send your location in reply to this message.`,
      button: { text: "Open the map", url: `${SITE_URL}/` },
    };
  }
  let place = at;
  if (!place) {
    try {
      const towns = (await layer("weather-2h").catch(() => null))?.items || [];
      place = await where(arg, towns);
    } catch {
      return sourceDown("OneMap's search");
    }
    if (!place) return notFound(arg);
  }
  if (!(place.lat > 1.13 && place.lat < 1.5 && place.lng > 103.55 && place.lng < 104.13)) return { text: "That's outside Singapore, so the map can't open there." };
  const url = mapLink({ lat: place.lat, lng: place.lng, z: 16 });
  return { text: `The map at ${place.name || "your location"}: ${url}`, button: { text: "Open the map here", url } };
}

// ---------- a location ----------

export async function located(lat, lng) {
  const at = { name: "you", lat, lng };
  if (!(lat > 1.13 && lat < 1.5 && lng > 103.55 && lng < 104.13)) return { text: "That's outside Singapore, so there's nothing to show there." };
  const [w, r] = await Promise.all([layer("weather-2h").catch(() => null), rain("", at)]);
  if (!w) return r;
  const f = forecastAt(w, { ...at, name: "" });
  if (!r.markdown) return { ...f, button: r.button || f.button };
  return {
    markdown: `${f.markdown}\n\n${r.markdown.replace(/^## /, "### ")}`,
    fallback: `${f.fallback}\n\n${r.fallback}`,
    button: r.button,
  };
}

// ---------- the text of a message, to a reply ----------

// "/weather@SGMapBot Tampines" as { command: "weather", arg: "Tampines" }; null when it's not a
// command, or one addressed to another bot.
export function parseCommand(text, username = "") {
  const m = String(text || "").trim().match(/^\/([a-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  if (m[2] && username && m[2].toLowerCase() !== username.toLowerCase()) return null;
  return { command: m[1].toLowerCase(), arg: (m[3] || "").trim().slice(0, 80) };
}

export async function replyTo(message, username = "") {
  if (message?.location) {
    const lat = Number(message.location.latitude);
    const lng = Number(message.location.longitude);
    // In reply to the bot (its /link): a link to the map there. Otherwise the weather there.
    if (message.reply_to_message?.from?.is_bot) return link("", { name: "", lat, lng });
    return located(lat, lng);
  }
  const cmd = parseCommand(message?.text, username);
  if (!cmd) return message?.chat?.type === "private" ? help() : null;
  switch (cmd.command) {
    case "weather":
      return weather(cmd.arg);
    case "rain":
      return rain(cmd.arg);
    case "psi":
      return psi();
    case "carpark":
    case "carparks":
      return carpark(cmd.arg);
    case "link":
      return link(cmd.arg);
    default:
      // /start, /help, and in a private chat anything else; a group's other bots' commands get nothing.
      return ["start", "help"].includes(cmd.command) || message?.chat?.type === "private" ? help() : null;
  }
}
