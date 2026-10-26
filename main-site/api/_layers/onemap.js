// OneMap's themes: the hundreds of point datasets Singapore's agencies publish on OneMap
// (hawker centres, libraries, parks, clinics, kindergartens, sports halls, and on). The list of
// them is one layer, kept for a day and in Supabase by the cron; each theme's places another,
// asked for by its query name, which has to be one the list names.
//
// Both need a OneMap token (api/_lib/onemap.js), which stays on the server.

import { ONEMAP, onemapGet } from "../_lib/onemap.js";
import { UpstreamError } from "../_lib/http.js";
import { positionText, str } from "../_lib/pick.js";
import { layerKey, readCache } from "../_lib/store.js";

const DAY = 24 * 3600 * 1000;
const MAX_PLACES = 6000;
const QUERY_NAME = /^[A-Za-z0-9_]{2,80}$/;

const themeList = () => onemapGet(`${ONEMAP}/api/public/themesvc/getAllThemesInfo?moreInfo=Y`);

export const onemapThemes = {
  id: "onemap-themes",
  maxAge: 86400,
  snapshot: { maxAgeMs: 2 * DAY },
  load: themeList,
  trim(data) {
    const seen = new Set();
    const themes = [];
    for (const t of Array.isArray(data?.Theme_Names) ? data.Theme_Names : []) {
      const q = str(t?.QUERYNAME, 80);
      if (!QUERY_NAME.test(q) || seen.has(q)) continue;
      seen.add(q);
      themes.push({ q, name: str(t.THEMENAME, 100), category: str(t.CATEGORY, 60) });
    }
    themes.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return { at: Date.now(), themes, items: [] };
  },
};

// The places of one theme. A point is drawn at its LatLng; a line or an area (LatLng a list of
// "lat,lng" split by "|") at its first point, as the themes are read as places.
export const onemapTheme = {
  id: "onemap",
  maxAge: 86400,
  params(q) {
    const theme = String(q.theme || "");
    if (!QUERY_NAME.test(theme)) throw new UpstreamError("theme must be a OneMap query name", 400);
    return { theme };
  },
  async load({ theme }) {
    // Only a theme the list names: a typo or a guess costs no call to OneMap's data service.
    const kept = (await readCache(layerKey(onemapThemes.id)))?.value;
    const list = Array.isArray(kept?.themes) ? kept : onemapThemes.trim(await themeList());
    if (!list.themes.some((t) => t.q === theme)) throw new UpstreamError("That OneMap theme doesn't exist", 404);
    return onemapGet(`${ONEMAP}/api/public/themesvc/retrieveTheme?queryName=${encodeURIComponent(theme)}`);
  },
  trim(data, { theme } = {}) {
    const results = Array.isArray(data?.SrchResults) ? data.SrchResults : [];
    const info = results[0] || {};
    const items = [];
    for (const r of results.slice(1)) {
      if (items.length >= MAX_PLACES) break;
      const first = String(r?.LatLng || "").split("|")[0];
      const at = positionText(first);
      if (!at) continue;
      const postal = str(r.ADDRESSPOSTALCODE, 6);
      const street = [str(r.ADDRESSBLOCKHOUSENUMBER, 10), str(r.ADDRESSSTREETNAME, 80)].filter(Boolean).join(" ");
      items.push({
        name: str(r.NAME, 120),
        description: str(r.DESCRIPTION, 200),
        address: [street, /^\d{6}$/.test(postal) ? `Singapore ${postal}` : ""].filter(Boolean).join(", "),
        lat: at[0],
        lng: at[1],
      });
    }
    return { at: Date.now(), theme: str(theme, 80), name: str(info.Theme_Name, 100), owner: str(info.Owner, 80), items };
  },
};

export default [onemapThemes, onemapTheme];
