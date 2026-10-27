// The pure helpers: forecast icons, colour bands, SVY21, the offline download's tile count, and
// that every marker colour keeps its white icon readable.

import assert from "node:assert/strict";
import { test } from "node:test";

import { COLOURS, carparkColour, forecastLook, lineOf, psiBand, pm25Band, uvBand, windRotation, shorten, gridRound } from "../js/format.js";
import { svy21ToLatLng, position, positionText, safeUrl, str, num } from "../api/_lib/pick.js";
import { tilesFor } from "../js/map-save.js";

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("every marker colour carries a white icon at 4.5:1 or more", () => {
  for (const [name, hex] of Object.entries(COLOURS)) assert.ok(contrast(hex, "#ffffff") >= 4.5, `${name} ${hex}: ${contrast(hex, "#ffffff").toFixed(2)}`);
});

test("the theme's text pairs clear AA (uwuapps-theme.md tokens)", () => {
  assert.ok(contrast("#121815", "#ffffff") >= 4.5);
  assert.ok(contrast("#eef2ef", "#101512") >= 4.5);
  assert.ok(contrast("#1f6b3d", "#ffffff") >= 4.5);
  assert.ok(contrast("#bff5cf", "#101512") >= 4.5);
});

test("forecast words pick an icon", () => {
  assert.equal(forecastLook("Thundery Showers").icon, "storm");
  assert.equal(forecastLook("Light Rain").icon, "rain");
  assert.equal(forecastLook("Partly Cloudy (Night)").icon, "partly");
  assert.equal(forecastLook("Fair (Night)").icon, "moon");
  assert.equal(forecastLook("Fair and Warm").icon, "sun");
  assert.equal(forecastLook("Hazy").icon, "haze");
  assert.equal(forecastLook("").icon, "cloud");
});

test("bands", () => {
  assert.equal(psiBand(40).band, "good");
  assert.equal(psiBand(150).band, "unhealthy");
  assert.equal(psiBand(null).band, "unknown");
  assert.equal(pm25Band(60).band, "elevated");
  assert.equal(uvBand(11).band, "extreme");
  assert.equal(carparkColour(3), COLOURS.red);
  assert.equal(carparkColour(50), COLOURS.green);
});

test("lines from station codes", () => {
  assert.equal(lineOf("NS10"), "NS");
  assert.equal(lineOf("STC"), "SK");
  assert.equal(lineOf(""), null);
});

test("small helpers", () => {
  assert.equal(windRotation(0), 180);
  assert.equal(windRotation(270), 90);
  assert.ok(shorten("Thundery Showers with Gusty Winds", 10).length <= 10);
  assert.ok(shorten("Thundery Showers with Gusty Winds", 10).endsWith("…"));
  assert.equal(gridRound(1.23456), 1.23);
  assert.equal(num("1.5"), 1.5);
  assert.equal(num("abc"), null);
  assert.equal(str({ a: 1 }), "");
  assert.equal(str("  a \n b  "), "a b");
});

test("positions are kept to Singapore", () => {
  assert.deepEqual(position("1.3", "103.8"), [1.3, 103.8]);
  assert.equal(position(51.5, -0.1), null);
  assert.deepEqual(positionText("1.29375 103.85718"), [1.29375, 103.85718]);
  assert.deepEqual(positionText("1.3,103.8"), [1.3, 103.8]);
  assert.equal(positionText(""), null);
});

test("links only to the hosts expected", () => {
  assert.ok(safeUrl("https://images.data.gov.sg/x.jpg", ["images.data.gov.sg"]));
  assert.equal(safeUrl("http://images.data.gov.sg/x.jpg", ["images.data.gov.sg"]), null);
  assert.equal(safeUrl("https://images.data.gov.sg.evil.com/x.jpg", ["images.data.gov.sg"]), null);
  assert.equal(safeUrl("javascript:alert(1)", ["x"]), null);
});

test("SVY21 to latitude and longitude", () => {
  // The grid's origin is SVY21's own reference point.
  assert.deepEqual(svy21ToLatLng(38744.572, 28001.642), [1.36667, 103.83333]);
  // A point in the west, as LTA's guide samples one.
  const p = svy21ToLatLng(32521.5, 20786.6);
  assert.ok(p[0] > 1.3 && p[0] < 1.32 && p[1] > 103.76 && p[1] < 103.78, String(p));
  assert.equal(svy21ToLatLng("x", 1), null);
});

test("the offline download stays within OpenFreeMap's 3000 tiles", () => {
  const n = tilesFor("{z}/{x}/{y}", 9, 14).length;
  assert.ok(n > 300 && n < 2600, String(n));
});
