// The Telegram bot's webhook, with fetch stubbed (no real Telegram, LTA, data.gov.sg or OneMap):
// the secret check, the rich message's shape, the plain fallback, and each command's reply.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import webhook from "../api/telegram/webhook.js";
import { forgetLayers, parseCommand } from "../api/_lib/bot.js";
import { escapeMd, richTable } from "../api/_lib/telegram.js";
import { LTA, dgsData } from "./fixtures.mjs";

const TOKEN = "123456:TEST-BOT-TOKEN";
const SECRET = "test-webhook-secret";
const realFetch = globalThis.fetch;
let sent = []; // what went to Telegram: { method, body }
let searches = []; // what OneMap was asked
let richFails = false;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const AREAS = [["Ang Mo Kio", 1.375, 103.839, "Light Showers"], ["Bishan", 1.35, 103.839, "Cloudy"], ["Tampines", 1.345, 103.944, "Thundery Showers"]];
const forecast = {
  code: 0,
  data: {
    area_metadata: AREAS.map(([name, latitude, longitude]) => ({ name, label_location: { latitude, longitude } })),
    items: [{ timestamp: "2026-10-27T08:00:00+08:00", valid_period: { text: "8 to 10 am" }, forecasts: AREAS.map(([area, , , f]) => ({ area, forecast: f })) }],
  },
};
const rainfall = {
  code: 0,
  data: {
    stations: [
      { id: "S1", name: "Bishan Street 22", labelLocation: { latitude: 1.352, longitude: 103.841 } },
      { id: "S2", name: "Tampines Avenue 1", labelLocation: { latitude: 1.346, longitude: 103.943 } },
    ],
    readings: [{ timestamp: "2026-10-27T08:05:00+08:00", data: [{ stationId: "S1", value: 0.6 }, { stationId: "S2", value: 0 }] }],
    readingUnit: "mm",
  },
};

beforeEach(() => {
  sent = [];
  searches = [];
  richFails = false;
  forgetLayers();
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.LTA_ACCOUNT_KEY = "lta-key";
  delete process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.ONEMAP_EMAIL;
  delete process.env.ONEMAP_PASSWORD;
  delete process.env.SUPABASE_URL;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === "api.telegram.org") {
      const method = u.pathname.split("/").pop();
      sent.push({ method, path: u.pathname, body: JSON.parse(init.body) });
      if (method === "sendRichMessage" && richFails) return json({ ok: false, description: "Bad Request: can't parse rich message" }, 400);
      return json({ ok: true, result: { message_id: 1 } });
    }
    if (u.pathname.endsWith("/two-hr-forecast")) return json(forecast);
    if (u.pathname.endsWith("/rainfall")) return json(rainfall);
    if (u.pathname.endsWith("/psi")) return json({ code: 0, data: dgsData("PollutantStandardsIndexPSI.json", "/psi") });
    if (u.pathname.endsWith("/pm25")) return json({ code: 0, data: dgsData("PM2.5.json", "/pm25") });
    if (u.pathname.endsWith("/CarParkAvailabilityv2")) return json({ value: u.searchParams.get("$skip") === "0" ? LTA.carparks : [] });
    if (u.pathname.endsWith("/elastic/search")) {
      const q = u.searchParams.get("searchVal");
      searches.push(q);
      if (/nowhere/i.test(q)) return json({ found: 0, results: [] });
      return json({ found: 1, results: [{ SEARCHVAL: "SUNTEC CITY", BUILDING: "SUNTEC CITY", LATITUDE: "1.2955", LONGITUDE: "103.8585" }] });
    }
    return json({ message: "not stubbed" }, 404);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function call({ body, secret = SECRET, method = "POST" } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(text) { resolve({ status: this.statusCode, text: String(text ?? "") }); },
    };
    webhook({ method, headers: secret == null ? {} : { "x-telegram-bot-api-secret-token": secret }, body }, res);
  });
}

const msg = (text, extra = {}) => ({ update_id: 1, message: { message_id: 5, chat: { id: 42, type: "private" }, text, ...extra } });

test("no secret, a wrong one, or no TELEGRAM_WEBHOOK_SECRET at all: 401, and nothing is sent", async () => {
  assert.equal((await call({ body: msg("/help"), secret: null })).status, 401);
  assert.equal((await call({ body: msg("/help"), secret: "wrong" })).status, 401);
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  assert.equal((await call({ body: msg("/help") })).status, 401);
  assert.equal(sent.length, 0);
});

test("only POST", async () => {
  assert.equal((await call({ method: "GET" })).status, 405);
});

test("/start is a rich message: the shape sendRichMessage takes, with a button to the map", async () => {
  const r = await call({ body: msg("/start") });
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes(TOKEN));
  assert.equal(sent.length, 1);
  const { method, body, path } = sent[0];
  assert.equal(method, "sendRichMessage");
  assert.equal(path, `/bot${TOKEN}/sendRichMessage`);
  assert.equal(body.chat_id, 42);
  assert.equal(typeof body.rich_message.markdown, "string");
  assert.deepEqual(Object.keys(body.rich_message), ["markdown"]);
  assert.equal(body.text, undefined);
  assert.equal(body.parse_mode, undefined);
  assert.match(body.rich_message.markdown, /^# SG Map Explorer/);
  assert.match(body.rich_message.markdown, /\| --- \| --- \| --- \|/);
  assert.match(body.reply_markup.inline_keyboard[0][0].url, /^https:\/\/sgmap\.uwuapps\.org\//);
});

test("when the rich message is refused, the plain fallback goes with sendMessage", async () => {
  richFails = true;
  await call({ body: msg("/help") });
  assert.deepEqual(sent.map((s) => s.method), ["sendRichMessage", "sendMessage"]);
  const plain = sent[1].body;
  assert.equal(plain.chat_id, 42);
  assert.match(plain.text, /\/weather <place>/);
  assert.doesNotMatch(plain.text, /[#|*]/);
  assert.equal(plain.parse_mode, undefined);
  assert.ok(plain.reply_markup.inline_keyboard[0][0].url);
});

test("/weather <town> answers that town's forecast and links the map there", async () => {
  await call({ body: msg("/weather tampines") });
  const { body } = sent[0];
  assert.match(body.rich_message.markdown, /## Tampines/);
  assert.match(body.rich_message.markdown, /Thundery Showers/);
  const url = new URL(body.reply_markup.inline_keyboard[0][0].url);
  assert.equal(url.searchParams.get("layers"), "weather-2h");
  assert.match(url.searchParams.get("at"), /^1\.34500,103\.94400$/);
  assert.equal(searches.length, 0, "a town NEA names needs no OneMap search");
});

test("/weather <place> finds the nearest NEA town through OneMap", async () => {
  await call({ body: msg("/weather Suntec") });
  assert.deepEqual(searches, ["Suntec"]);
  assert.match(sent[0].body.rich_message.markdown, /nearest NEA area to Suntec City/);
});

test("/weather alone lists every town", async () => {
  await call({ body: msg("/weather") });
  const md = sent[0].body.rich_message.markdown;
  for (const [name] of AREAS) assert.ok(md.includes(`| ${name} |`), name);
});

test("/rain <place> says whether the gauges near it have rain", async () => {
  await call({ body: msg("/rain Bishan") });
  const md = sent[0].body.rich_message.markdown;
  assert.match(md, /## Raining near Bishan/);
  assert.match(md, /Bishan Street 22 \| 0\.6 mm/);
  assert.equal(new URL(sent[0].body.reply_markup.inline_keyboard[0][0].url).searchParams.get("layers"), "rainfall,radar");
});

test("/rain alone lists where it's raining", async () => {
  await call({ body: msg("/rain") });
  assert.match(sent[0].body.rich_message.markdown, /Raining at 1 of 2 gauges/);
});

test("/psi is a table of the regions", async () => {
  await call({ body: msg("/psi") });
  const md = sent[0].body.rich_message.markdown;
  assert.match(md, /## Air quality/);
  for (const r of ["North", "South", "East", "West", "Central"]) assert.ok(md.includes(`| ${r} |`), r);
  assert.match(sent[0].body.rich_message.markdown, /\|  \| PSI \| Band \| PM2\.5 \|/);
});

test("/carpark <place> lists the nearest carparks with free lots", async () => {
  await call({ body: msg("/carpark Suntec") });
  const md = sent[0].body.rich_message.markdown;
  assert.match(md, /## Carparks near Suntec City/);
  assert.match(md, /\| Suntec City \| 352 \|/);
  assert.equal(new URL(sent[0].body.reply_markup.inline_keyboard[0][0].url).searchParams.get("layers"), "carparks");
});

test("a place OneMap can't find gets one plain line", async () => {
  await call({ body: msg("/carpark nowhere at all") });
  assert.equal(sent[0].method, "sendMessage");
  assert.match(sent[0].body.text, /Couldn't find "nowhere at all"/);
});

test("a location gets the forecast and the rain there", async () => {
  await call({ body: msg(undefined, { location: { latitude: 1.351, longitude: 103.84 } }) });
  const md = sent[0].body.rich_message.markdown;
  assert.match(md, /## Bishan/);
  assert.match(md, /### Raining near you/);
});

test("in a group, another bot's command or plain chat gets nothing", async () => {
  process.env.TELEGRAM_BOT_USERNAME = "SGMapExplorerBot";
  const group = (text) => ({ update_id: 2, message: { chat: { id: -100, type: "group" }, text } });
  await call({ body: group("/weather@SomeOtherBot Tampines") });
  await call({ body: group("good morning") });
  assert.equal(sent.length, 0);
  await call({ body: group("/psi@SGMapExplorerBot") });
  assert.equal(sent.length, 1);
});

test("a reply that couldn't be sent still answers Telegram 200", async () => {
  globalThis.fetch = async () => { throw new Error("network down"); };
  assert.equal((await call({ body: msg("/help") })).status, 200);
});

test("commands parse, with or without the bot's name", () => {
  assert.deepEqual(parseCommand("/weather@MyBot  Ang Mo Kio "), { command: "weather", arg: "Ang Mo Kio" });
  assert.deepEqual(parseCommand("/PSI"), { command: "psi", arg: "" });
  assert.equal(parseCommand("hello"), null);
  assert.equal(parseCommand("/psi@Other", "Mine"), null);
});

test("data is escaped for Rich Markdown, and tables keep to one line a row", () => {
  assert.equal(escapeMd("Blk *1* [A]|B #2 <x>"), "Blk \\*1\\* \\[A\\]\\|B \\#2 \\<x\\>");
  const t = richTable(["Free"], [["Car|park\nA", "3"]]);
  assert.equal(t.split("\n").length, 3);
  assert.match(t, /Car\\\|park A/);
});
