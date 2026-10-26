// OneMap, Singapore's official map, for its themes (api/_layers/onemap.js): the token and a GET
// that carries it.
//
// With ONEMAP_EMAIL and ONEMAP_PASSWORD set, the function trades them for a token, which OneMap
// says lasts three days, and reuses it until an hour before it runs out. It's kept in the
// function's memory and, when Supabase is set up, in server_cache, so a new instance picks up
// the one already issued rather than signing in again. The token never leaves the server.

import { UpstreamError } from "./http.js";
import { readCache, writeCache } from "./store.js";

export const ONEMAP = "https://www.onemap.gov.sg";
const TOKEN_URL = `${ONEMAP}/api/auth/post/getToken`;
const TOKEN_KEY = "onemap:token";
// Renewed this long before it runs out, so no request goes out on one that lapses on the way.
const TOKEN_MARGIN_MS = 3600 * 1000;
const TOKEN_LIFETIME_MS = 3 * 24 * 3600 * 1000;

let memo = null; // { token, expires }

export const onemapConfigured = () => Boolean(process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD);

const usable = (t) => t && typeof t.token === "string" && Date.now() < t.expires - TOKEN_MARGIN_MS;

async function signIn() {
  const { ONEMAP_EMAIL: email, ONEMAP_PASSWORD: password } = process.env;
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new UpstreamError(`OneMap sign-in replied ${r.status}`);
  const data = await r.json();
  if (typeof data?.access_token !== "string") throw new UpstreamError("OneMap sign-in gave no token");
  // expiry_timestamp is Unix seconds, as a string.
  return { token: data.access_token, expires: Number(data.expiry_timestamp) * 1000 || Date.now() + TOKEN_LIFETIME_MS };
}

export async function getToken({ renew = false } = {}) {
  if (!onemapConfigured()) throw new UpstreamError("ONEMAP_EMAIL and ONEMAP_PASSWORD aren't set", 503);
  if (!renew && usable(memo)) return memo.token;
  if (!renew) {
    const kept = (await readCache(TOKEN_KEY))?.value;
    if (usable(kept)) {
      memo = { token: kept.token, expires: kept.expires };
      return memo.token;
    }
  }
  memo = await signIn();
  await writeCache(TOKEN_KEY, { token: memo.token, expires: memo.expires });
  return memo.token;
}

// A GET with the token, and one more try on a new token if OneMap has stopped taking the old one.
export async function onemapGet(url) {
  const send = (token) =>
    fetch(url, { headers: { accept: "application/json", Authorization: token }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  let r = await send(await getToken());
  if (r.status === 401 || r.status === 403) r = await send(await getToken({ renew: true }));
  if (!r.ok) throw new UpstreamError(`OneMap replied ${r.status}`);
  return r.json();
}
