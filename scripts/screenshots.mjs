// The manifest's screenshots, main-site/images/screenshot_1.png (narrow, 1080x2340) and
// screenshot_2.png (wide, 1920x1080), with Playwright: the site served locally with made-up layer
// data (scripts/serve-stub.mjs), so no API key is needed, over OpenFreeMap's real map tiles.
// Drawn at a phone's or a laptop's size and 3x or 2x the pixels, so the text is sharp, and taken
// once the map has drawn every tile and the fonts are in. The tour is marked as seen first.
//
// Run from the project root: node scripts/screenshots.mjs
// Needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium).

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStub } from "./serve-stub.mjs";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = createRequire(`${execSync("npm root -g").toString().trim()}/`)("playwright");
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "main-site", "images");
const PORT = 4174;

const SHOTS = [
  {
    file: "screenshot_1.png",
    // 360 x 780 at 3x: 1080 x 2340, the manifest's narrow size.
    viewport: { width: 360, height: 780 },
    scale: 3,
    layers: ["mrt", "weather-2h", "carparks"],
    view: { c: [103.8525, 1.2862], z: 15.7, b: -28, p: 60 },
  },
  {
    file: "screenshot_2.png",
    // 960 x 540 at 2x: 1920 x 1080, the manifest's wide size.
    viewport: { width: 960, height: 540 },
    scale: 2,
    layers: ["mrt", "weather-2h", "traffic-cams", "psi"],
    view: { c: [103.835, 1.3405], z: 11.75, b: 0, p: 0 },
  },
];

const server = await startStub(PORT);
const browser = await playwright.chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: shot.scale, serviceWorkers: "block", locale: "en-SG", timezoneId: "Asia/Singapore" });
    await ctx.addInitScript((s) => {
      localStorage.setItem("tour.welcome", "done");
      localStorage.setItem("tour.pages", JSON.stringify(["map"]));
      localStorage.setItem("sgmap.layers", JSON.stringify(s.layers));
      localStorage.setItem("sgmap.view", JSON.stringify(s.view));
      localStorage.setItem("sgmap.mode", "light");
    }, shot);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector("html[data-map-idle]", { timeout: 90_000 });
    // Settle: the last labels placed, and idle again after them.
    await page.waitForTimeout(2500);
    await page.waitForSelector("html[data-map-idle]", { timeout: 30_000 });
    await page.screenshot({ path: join(OUT, shot.file) });
    console.log(`${shot.file}: ${shot.viewport.width * shot.scale}x${shot.viewport.height * shot.scale}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
