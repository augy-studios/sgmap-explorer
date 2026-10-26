// GET /api/layer/<id>: one map layer, from api/_layers/. The reply is the layer's trim() of what
// its upstream sent, an allow-list of fields, with a Cache-Control set to how often the feed
// changes, so Vercel's edge answers most requests and the upstreams see a few a minute at most.
//
// A layer with a `snapshot` (bus stops, taxi stands, OneMap's themes list, and the island-wide
// bicycle parking the weekly cron gathers) is kept in Supabase (api/_lib/store.js), filled on
// demand: served from there while fresh, fetched again from upstream once stale and kept, and
// the stale copy served if the upstream doesn't answer. Vercel's edge, in front, serves its own
// copy while it fetches a new one behind (stale-while-revalidate), so a stale copy costs one slow
// request a day at most, never one per visitor.

import { LAYERS } from "../_layers/index.js";
import { UpstreamError } from "../_lib/http.js";
import { sendError, sendJson } from "../_lib/respond.js";
import { layerKey, readCache, storeConfigured, writeCache } from "../_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendError(res, 405, "Only GET");
  const layer = Object.hasOwn(LAYERS, String(req.query.id)) ? LAYERS[req.query.id] : null;
  if (!layer) return sendError(res, 404, "No such layer");

  let params;
  try {
    params = layer.params ? layer.params(req.query) : {};
  } catch (err) {
    return sendError(res, err.status || 400, err.message);
  }

  const snap = layer.snapshot && !(layer.snapshot.onlyWithout || []).some((k) => params[k] != null) ? layer.snapshot : null;
  let kept = null;
  if (snap && storeConfigured()) {
    kept = await readCache(layerKey(layer.id));
    if (kept && Date.now() - kept.savedAt < snap.maxAgeMs) return sendJson(res, 200, kept.value, { maxAge: layer.maxAge });
  }

  try {
    const body = layer.trim(await layer.load(params), params);
    if (snap && !body.byArea) await writeCache(layerKey(layer.id), body);
    return sendJson(res, 200, body, { maxAge: layer.maxAge });
  } catch (err) {
    console.error(`layer ${layer.id}:`, err.message);
    // An older copy beats none, for a layer that changes this rarely.
    if (kept) return sendJson(res, 200, kept.value, { maxAge: 300 });
    if (err instanceof UpstreamError) {
      const why = err.status === 503 ? "This layer isn't set up on this server yet." : err.status < 500 ? err.message : "The data source didn't answer. Try again in a minute.";
      return sendError(res, err.status, why);
    }
    return sendError(res, 500, "Something went wrong reading this layer.");
  }
}
