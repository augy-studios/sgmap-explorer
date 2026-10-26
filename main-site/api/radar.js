// GET /api/radar?range=70km: NEA's latest rain radar picture, as PNG bytes. data.gov.sg links it
// from S3 for 20 minutes without CORS, which a WebGL map can't draw from, so this function
// fetches it and passes the picture on. Only the image goes out: never the link, or anything
// else data.gov.sg sent with it. Where it goes on the map comes from /api/layer/radar.

import { RADAR_RANGES } from "./_layers/weather.js";
import { dataGov } from "./_lib/http.js";
import { safeUrl } from "./_lib/pick.js";
import { sendError, sendImage } from "./_lib/respond.js";

const MAX_BYTES = 4 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "GET") return sendError(res, 405, "Only GET");
  const range = Object.hasOwn(RADAR_RANGES, String(req.query.range)) ? String(req.query.range) : "70km";
  try {
    const data = await dataGov(RADAR_RANGES[range]);
    const link = safeUrl(data?.records?.[0]?.image?.url, ["amazonaws.com", "data.gov.sg"]);
    if (!link) return sendError(res, 502, "The radar had no picture");
    const r = await fetch(link, { signal: AbortSignal.timeout(15_000) });
    const type = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!r.ok) return sendError(res, 502, "The radar picture didn't come");
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > MAX_BYTES) return sendError(res, 502, "The radar picture was too big");
    // NEA updates it every 5 minutes.
    return sendImage(res, bytes, type || "image/png", 240);
  } catch (err) {
    console.error("radar:", err.message);
    return sendError(res, 502, "The radar didn't answer. Try again in a minute.");
  }
}
