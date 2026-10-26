// The API routes end to end, with fetch stubbed: what goes out to the upstream (the key, in its
// header) and what comes back to the browser (trimmed, cached at the edge, the key nowhere).

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import layerRoute from "../api/layer/[id].js";
import cron from "../api/cron.js";
import { CANARY, LTA, dgsData } from "./fixtures.mjs";

const KEY = "TEST-LTA-KEY-0000";
const DGS = "TEST-DGS-KEY-0000";
const realFetch = globalThis.fetch;
let calls = [];

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  process.env.LTA_ACCOUNT_KEY = KEY;
  process.env.DATA_GOV_KEY = DGS;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.CRON_SECRET = "cron-secret";
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: u, headers: init.headers || {} });
    if (u.pathname.endsWith("/BusStops")) return reply({ "odata.metadata": "x", value: u.searchParams.get("$skip") === "0" ? LTA.busStops : [] });
    if (u.pathname.endsWith("/two-hr-forecast")) return reply({ code: 0, errorMsg: "", data: dgsData("2hourWeatherForecast.json", "/two-hr-forecast") });
    return reply({ message: "not stubbed" }, 404);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function call(handler, { query = {}, headers = {}, method = "GET" } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(body) { resolve({ status: this.statusCode, headers: this.headers, text: String(body ?? "") }); },
    };
    handler({ method, query, headers }, res);
  });
}

test("a layer goes to LTA with the key in its header, and back without it", async () => {
  const r = await call(layerRoute, { query: { id: "bus-stops" } });
  assert.equal(r.status, 200);
  assert.ok(calls.length >= 1);
  assert.equal(calls[0].headers.AccountKey, KEY);
  assert.ok(!calls[0].url.href.includes(KEY), "the key went in the URL");
  assert.ok(!r.text.includes(KEY));
  assert.ok(!r.text.includes(CANARY));
  assert.ok(!r.text.includes("odata"));
  assert.match(r.headers["cache-control"], /s-maxage=86400/);
  const body = JSON.parse(r.text);
  assert.equal(body.items.length, 1, "the stop off the map is left out");
});

test("data.gov.sg gets its key as x-api-key, never in the reply", async () => {
  const r = await call(layerRoute, { query: { id: "weather-2h" } });
  assert.equal(r.status, 200);
  assert.equal(calls[0].headers["x-api-key"], DGS);
  assert.ok(!r.text.includes(DGS));
  assert.match(r.headers["cache-control"], /s-maxage=600/);
});

test("an unknown layer is a 404, and nothing is fetched", async () => {
  for (const id of ["nope", "__proto__", "constructor", "toString"]) {
    const r = await call(layerRoute, { query: { id } });
    assert.equal(r.status, 404, id);
  }
  assert.equal(calls.length, 0);
});

test("without its key a layer says it isn't set up, and nothing is fetched", async () => {
  delete process.env.LTA_ACCOUNT_KEY;
  const r = await call(layerRoute, { query: { id: "bus-stops" } });
  assert.equal(r.status, 503);
  assert.equal(calls.length, 0);
  assert.match(r.headers["cache-control"], /no-store/);
});

test("an upstream failure isn't passed on word for word", async () => {
  globalThis.fetch = async () => reply({ secret: CANARY }, 500);
  const r = await call(layerRoute, { query: { id: "carparks" } });
  assert.equal(r.status, 502);
  assert.ok(!r.text.includes(CANARY));
  assert.ok(!r.text.includes("datamall2"));
});

test("bad parameters are refused before any fetch", async () => {
  const bad = [
    { id: "bicycle-parking", lat: "51.5", lng: "-0.1" },
    { id: "onemap", theme: "../../etc" },
    { id: "onemap", theme: "" },
  ];
  for (const query of bad) {
    const r = await call(layerRoute, { query });
    assert.equal(r.status, 400, JSON.stringify(query));
  }
  assert.equal(calls.length, 0);
});

test("only GET", async () => {
  const r = await call(layerRoute, { query: { id: "bus-stops" }, method: "POST" });
  assert.equal(r.status, 405);
});

test("the cron refuses a call without CRON_SECRET", async () => {
  assert.equal((await call(cron, {})).status, 401);
  assert.equal((await call(cron, { headers: { authorization: "Bearer wrong" } })).status, 401);
  delete process.env.CRON_SECRET;
  assert.equal((await call(cron, { headers: { authorization: "Bearer undefined" } })).status, 401);
  assert.equal(calls.length, 0);
});

test("the cron does nothing without Supabase", async () => {
  const r = await call(cron, { headers: { authorization: "Bearer cron-secret" } });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
});
