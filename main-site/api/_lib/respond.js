// The one place a JSON reply leaves the API. Every body handed to sendJson() is built by a
// layer's trim() (api/_layers/), field by field from an allow-list, never an upstream or
// database payload as it came; tests/minimise.test.mjs fails if any other file calls res.json(),
// res.send() or res.end().

export function sendJson(res, status, body, { maxAge = 0, swr } = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Cache-Control",
    maxAge > 0 ? `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${swr ?? maxAge * 2}` : "no-store"
  );
  res.end(JSON.stringify(body));
}

// An error as one plain sentence. Upstream detail stays in the function's log.
export function sendError(res, status, message) {
  sendJson(res, status, { error: String(message).slice(0, 200) });
}

// An image proxied from upstream (api/radar.js): only PNG or JPEG bytes, never JSON.
export function sendImage(res, bytes, type, maxAge) {
  if (!/^image\/(png|jpeg)$/.test(type)) return sendError(res, 502, "The image didn't come");
  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", `public, max-age=60, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`);
  res.end(bytes);
}
