// Supabase, over its REST API (PostgREST) with plain fetch: no client library, no Supabase Auth.
// Only these functions reach it, with the service role (or sb_secret_) key; its one table,
// server_cache (migrations/0001_server_cache.sql), has row level security on and no policies, so
// the public anon key gets nothing from it.

const BASE = () => (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = () => process.env.SUPABASE_SERVICE_KEY || "";

export const supabaseConfigured = () => Boolean(BASE() && KEY());

// `path` is the table and its query, as PostgREST takes them: "server_cache?key=eq.abc".
// Answers the parsed body, or null for an empty one.
export async function rest(path, { method = "GET", body, prefer } = {}) {
  const key = KEY();
  const r = await fetch(`${BASE()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      // The older service_role key is a JWT and goes here too; a newer sb_secret_ key is
      // refused as a bearer token, and the apikey header alone carries it.
      ...(key.startsWith("eyJ") && { Authorization: `Bearer ${key}` }),
      "Content-Type": "application/json",
      ...(prefer && { Prefer: prefer }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* left null */
  }
  if (!r.ok) {
    const err = new Error(`supabase ${method} ${path.split("?")[0]} failed: ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}
