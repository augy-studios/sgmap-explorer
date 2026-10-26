# main-site

SG Map Explorer's site: static HTML, CSS and ES modules with no build step, plus Vercel Functions
in `api/`. Vercel serves this folder.

## The page

| File | What |
|---|---|
| `index.html` | The one page: the map, the Edge Tray, the map's buttons, the card and the modals. The pre-paint script sets the theme and the tray before first paint. |
| `style.css` | The theme (docs/uwuapps-theme.md), the Edge Tray, the tour, the update bar, then the app. |
| `js/app.js` | The start: language, theme, tray, map, layers, modals, update bar, tour. |
| `js/map.js` | MapLibre: base maps, 3D buildings, the OpenStreetMap fallback, the compass, the 3D button, locating you. |
| `js/layers.js` | Every layer: where its data comes from, how it's drawn, its card; the Layers sheet and the tray's quick buttons. |
| `js/format.js` | Pure helpers: forecast icons, colour bands, times. |
| `js/card.js` | The card a tapped marker opens. |
| `js/map-save.js` | Download the Singapore map for offline. |
| `js/tour.js` | The first-visit tour (docs/page-tour-spec.md). |
| `js/sw-update.js` | The service worker and the update bar (docs/update-bar-spec.md). |
| `js/tray.js` | The Edge Tray (docs/edge-tray-spec.md). |
| `js/theme.js`, `js/icons.js`, `js/ui.js` | The theme system, the SVG icons, modals and small helpers. |
| `i18n/` | Languages (docs/i18n-retrofit-spec.md): `en.json` is the source of truth. `node i18n/check-keys.js --usage` checks them. |
| `sw.js` | Offline: the shell, the map's caches, the saved map, the layers' last replies. **Bump `VERSION` on every deploy.** |
| `data/` | Vendored, from SG Bus Timings: MRT/LRT stations and tracks (cheeaun/sgraildata, from OpenStreetMap) and URA's planning areas. |
| `vendor/maplibre-5.24.0/` | MapLibre GL JS, self-hosted so the map works offline. |

## The API

Every layer is `GET /api/layer/<id>` (`api/layer/[id].js`), answered from the layer's module in
`api/_layers/`:

- `load()` fetches from upstream with the key on the server (`api/_lib/http.js`), and `trim()`
  builds the reply from an allow-list of fields. No route passes an upstream or database payload
  to the browser as it came, and no key ever leaves the server: `tests/minimise.test.mjs` checks
  both, feeding every `trim()` the samples in `docs/` with a canary field in every object.
- Replies are kept at Vercel's edge (`Cache-Control: s-maxage`) as long as each feed changes:
  a minute for taxis and carparks, 2 to 15 minutes for the weather and roads, a day for bus stops.
- LTA's paged datasets are read 500 rows at a time with `$skip`, four pages at once.

| Layer | Source | Edge cache |
|---|---|---|
| `bus-stops` | LTA BusStops | 1 day, and Supabase |
| `carparks` | LTA CarParkAvailabilityv2 | 1 min |
| `taxis` | data.gov.sg taxi-availability (LTA Taxi-Availability as fallback) | 1 min |
| `taxi-stands` | LTA TaxiStands | 1 day, and Supabase |
| `bicycle-parking` | LTA BicycleParkingv2: island-wide from Supabase, else by area (`?lat=&lng=`) | 1 day |
| `ev-chargers` | LTA EVCBatch | 5 min |
| `traffic-cams` | data.gov.sg traffic-images (LTA Traffic-Imagesv2 as fallback) | 1 min |
| `emas` | LTA VMS (the EMAS signs) and EstTravelTimes | 2 min |
| `incidents`, `faulty-lights` | LTA TrafficIncidents, FaultyTrafficLights (SVY21, converted) | 2 min |
| `weather-2h`, `forecast-24h`, `outlook-4d` | NEA forecasts, data.gov.sg v2 | 10, 30, 60 min |
| `air-temp`, `rainfall`, `humidity`, `wind` | NEA stations, data.gov.sg v2 | 2 to 5 min |
| `lightning`, `flood`, `wbgt`, `uv` | NEA and PUB, data.gov.sg v2 | 2 to 15 min |
| `psi`, `pm25` | NEA, data.gov.sg v2 | 15 min |
| `radar` | NEA radar: its place on the map; the picture itself from `/api/radar` | 4 min |
| `onemap-themes`, `onemap?theme=` | OneMap's themes service (token on the server) | 1 day |

`api/cron.js` (daily, with `CRON_SECRET`) keeps bus stops, taxi stands, OneMap's themes list and
the island-wide bicycle parking sweep (weekly) in Supabase.

## Supabase

One table, `server_cache` (`../migrations/0001_server_cache.sql`): the slow layers' trimmed
replies and the OneMap token, so every function instance shares one. Row level security is on
with no policies; only the functions reach it, with the service key. There are no users,
sessions or visitor records, and no Supabase Auth. Without Supabase everything still works,
except island-wide bicycle parking (it shows by area instead).

## Environment variables

See `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CRON_SECRET`, `ONEMAP_EMAIL`,
`ONEMAP_PASSWORD`, `DATA_GOV_KEY`, `LTA_ACCOUNT_KEY`. All server-only.

## Offline

`sw.js` precaches the shell and keeps MapLibre, OpenFreeMap's styles, fonts, sprites and tiles as
they're seen. The Download button saves every OpenFreeMap tile over Singapore from zoom 9 to 14
(about 530 tiles; with the styles, fonts and data, some 550 files and 35 MB on the device), within OpenFreeMap's limits for an offline download (3,000 tiles,
50 MB), with the MRT, planning areas, bus stops and taxi stands. OneMap's and OpenStreetMap's
tiles aren't bulk-downloaded (their terms don't allow it): offline, the map uses OpenFreeMap's.

## Checks

```sh
npm test          # node --test tests/*.test.mjs
npm run check     # node --check on every file
npm run i18n      # i18n key check
```
