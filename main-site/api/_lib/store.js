// The server's own cache in Supabase (table server_cache): the layers that change rarely and are
// slow to gather (every bus stop, every bicycle rack on the island, the OneMap themes list),
// kept as their trimmed replies by the daily cron (api/cron.js), and the OneMap token, so every
// function instance shares one instead of signing in on each cold start.
//
// Optional. With SUPABASE_URL or SUPABASE_SERVICE_KEY unset, or Supabase down, every read here
// answers null and every write does nothing, and the layers are fetched from upstream as asked
// for, kept at Vercel's edge as long as their Cache-Control allows.
//
// Nothing about the people using the app goes in here: there are no accounts, sessions or
// visitor records.

import { rest, supabaseConfigured } from "./supabase.js";

export const storeConfigured = supabaseConfigured;

// Where a snapshot layer's reply is kept (api/layer/[id].js, api/cron.js).
export const layerKey = (id) => `layer:${id}`;

// { value, savedAt } for `key`, or null.
export async function readCache(key) {
  if (!supabaseConfigured()) return null;
  try {
    const rows = await rest(`server_cache?key=eq.${encodeURIComponent(key)}&select=value,saved_at`);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? { value: row.value, savedAt: Date.parse(row.saved_at) || 0 } : null;
  } catch (err) {
    console.warn(`store: couldn't read ${key}: ${err.message}`);
    return null;
  }
}

export async function writeCache(key, value) {
  if (!supabaseConfigured()) return false;
  try {
    await rest("server_cache?on_conflict=key", {
      method: "POST",
      body: [{ key, value, saved_at: new Date().toISOString() }],
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    return true;
  } catch (err) {
    console.warn(`store: couldn't write ${key}: ${err.message}`);
    return false;
  }
}
