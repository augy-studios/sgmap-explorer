// The weekly cron (vercel.json, Mondays 03:00 Singapore time), with CRON_SECRET: the island-wide
// sweep of LTA's bicycle parking into Supabase (api/_lib/store.js). LTA answers bicycle parking
// only for a circle round a point, so the whole island takes a few hundred requests, far too
// slow for a map request to wait on; and it changes monthly, so once a week is plenty.
//
// Every other slow layer (bus stops, taxi stands, OneMap's themes list) fills its Supabase copy
// on demand instead: api/layer/[id].js keeps each fresh reply, serves it while fresh, fetches
// again once it's stale, and falls back to the stale copy if the upstream doesn't answer.
//
// ?sweep=1 runs the sweep even when the copy kept is still fresh, for the first fill after a
// deploy. Without Supabase there's nowhere to keep it, and it does nothing.

import { LAYERS } from "./_layers/index.js";
import { hasLtaKey } from "./_lib/http.js";
import { sendError, sendJson } from "./_lib/respond.js";
import { layerKey, readCache, storeConfigured, writeCache } from "./_lib/store.js";

const SWEEP_EVERY_MS = 6 * 24 * 3600 * 1000;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "Not allowed");
  if (!storeConfigured()) return sendJson(res, 200, { refreshed: [], skipped: "Supabase isn't set up" });
  if (!hasLtaKey()) return sendJson(res, 200, { refreshed: [], skipped: "LTA_ACCOUNT_KEY isn't set" });

  const kept = await readCache(layerKey("bicycle-parking"));
  if (kept && Date.now() - kept.savedAt < SWEEP_EVERY_MS && req.query?.sweep !== "1") {
    return sendJson(res, 200, { refreshed: [], skipped: "The bicycle parking copy is less than 6 days old" });
  }
  try {
    const body = await LAYERS["bicycle-parking"].sweep();
    const saved = await writeCache(layerKey("bicycle-parking"), body);
    return sendJson(res, saved ? 200 : 502, { refreshed: saved ? ["bicycle-parking"] : [], places: body.items.length });
  } catch (err) {
    console.error("cron bicycle-parking:", err.message);
    return sendJson(res, 502, { refreshed: [], failed: ["bicycle-parking"] });
  }
}
