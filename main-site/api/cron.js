// The daily cron (vercel.json), with CRON_SECRET: refreshes the layers kept in Supabase
// (api/_lib/store.js) so map requests never wait on a slow gather. Bus stops, taxi stands and
// OneMap's themes list every day; bicycle parking, which takes a few hundred LTA requests to
// cover the island and changes monthly, when its copy is more than SWEEP_EVERY_MS old.
//
// Without Supabase there's nowhere to keep them, and it does nothing.

import { LAYERS } from "./_layers/index.js";
import { hasLtaKey } from "./_lib/http.js";
import { onemapConfigured } from "./_lib/onemap.js";
import { sendError, sendJson } from "./_lib/respond.js";
import { layerKey, readCache, storeConfigured, writeCache } from "./_lib/store.js";

const SWEEP_EVERY_MS = 6 * 24 * 3600 * 1000;
const DAILY = [
  ["bus-stops", hasLtaKey],
  ["taxi-stands", hasLtaKey],
  ["onemap-themes", onemapConfigured],
];

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "Not allowed");
  if (!storeConfigured()) return sendJson(res, 200, { refreshed: [], skipped: "Supabase isn't set up" });

  const refreshed = [];
  const failed = [];
  for (const [id, ready] of DAILY) {
    if (!ready()) continue;
    try {
      const layer = LAYERS[id];
      const body = layer.trim(await layer.load({}), {});
      if (await writeCache(layerKey(id), body)) refreshed.push(id);
    } catch (err) {
      console.error(`cron ${id}:`, err.message);
      failed.push(id);
    }
  }

  if (hasLtaKey()) {
    const kept = await readCache(layerKey("bicycle-parking"));
    if (!kept || Date.now() - kept.savedAt > SWEEP_EVERY_MS || req.query.sweep === "1") {
      try {
        const body = await LAYERS["bicycle-parking"].sweep();
        if (await writeCache(layerKey("bicycle-parking"), body)) refreshed.push("bicycle-parking");
      } catch (err) {
        console.error("cron bicycle-parking:", err.message);
        failed.push("bicycle-parking");
      }
    }
  }
  return sendJson(res, failed.length ? 207 : 200, { refreshed, failed });
}
