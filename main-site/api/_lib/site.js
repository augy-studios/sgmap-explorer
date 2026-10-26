// The site's own address, for links out of the server (the Telegram bot's "Open the map"), and a
// link to a spot on the map: /?at=lat,lng&z=zoom&layers=a,b, which js/map.js and js/layers.js read.

export const SITE_URL = (process.env.SITE_URL || "https://sgmap.uwuapps.org").replace(/\/+$/, "");

export function mapLink({ lat, lng, z = 15, layers = [] } = {}) {
  const q = new URLSearchParams();
  if (Number.isFinite(lat) && Number.isFinite(lng)) q.set("at", `${lat.toFixed(5)},${lng.toFixed(5)}`);
  q.set("z", String(z));
  if (layers.length) q.set("layers", layers.join(","));
  return `${SITE_URL}/?${q.toString().replace(/%2C/g, ",")}`;
}
