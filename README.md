# SG Map Explorer

A live 3D map of Singapore, as a PWA by UwU Apps: MRT, buses, carparks, traffic, weather and air
quality, layer by layer.

- **The map**: MapLibre GL JS over OpenFreeMap's vector map, with the buildings in 3D, or over
  OneMap's or OpenStreetMap's own tiles with the same 3D buildings on top. Two fingers dragged up
  or down tilt it; the compass button turns it with your phone.
- **The layers**, toggled from the Edge Tray: MRT and LRT lines and stations, bus stops, carparks,
  available taxis, taxi stands, bicycle parking, EV chargers, traffic cameras, EMAS signs and
  expressway travel times, traffic incidents, faulty traffic lights, NEA's 2-hour, 24-hour and
  4-day forecasts, the rain radar, rainfall, air temperature, humidity, wind, lightning, PUB's
  flood alerts, heat stress (WBGT), UV, PSI, PM2.5, URA's planning areas, and any of OneMap's
  themes.
- **Offline**: the app shell, the map's tiles as they're seen, and a Download button for the whole
  of Singapore's map.

## What's here

| Path | What |
|---|---|
| `main-site/` | The site Vercel serves (its Root Directory), with the serverless functions in `main-site/api/`. See [main-site/README.md](main-site/README.md). |
| `migrations/` | SQL to run by hand in Supabase's SQL editor, in order. Never edited once run: a change is a new file. |
| `scripts/serve-stub.mjs` | The site on `localhost` with made-up layer data, for working without API keys. |
| `scripts/screenshots.mjs` | Takes the manifest's two screenshots with Playwright. |
| `scripts/icon.svg` | The app icon's source; the `ESG-*.png` files and `favicon.ico` are rendered from it. |
| `docs/` | The specs the app follows (Edge Tray, page tour, update bar, i18n, theme), the data.gov.sg API samples and LTA's DataMall guide. |

## Deploying

1. Vercel project: Root Directory `main-site`, no build command, Node 20 or later. Vercel Pro, so
   the cron's 300-second run is allowed.
2. Environment variables: the names in [main-site/.env.example](main-site/.env.example).
3. Supabase (optional, recommended): run `migrations/0001_server_cache.sql` in the SQL editor,
   then set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
4. The cron (`vercel.json`) runs daily at 03:20 Singapore time and sends `CRON_SECRET`.

## Working on it

```sh
cd main-site
npm test            # the API's data minimisation, the routes, the helpers, the service worker
npm run check       # node --check on every JavaScript file
npm run i18n        # every language file against en.json
cd ..
node scripts/serve-stub.mjs     # then open http://localhost:4173
```

## Licence

See [LICENSE](LICENSE). MapLibre GL JS is vendored under its own licence in
`main-site/vendor/maplibre-5.24.0/`.
