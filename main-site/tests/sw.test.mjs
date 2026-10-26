// The service worker: the update bar's rule (no skipWaiting or clients.claim outside the message
// handler, docs/update-bar-spec.md), and a precache list that names real files, every i18n file
// among them (docs/i18n-retrofit-spec.md 10.3).

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const sw = readFileSync(join(SITE, "sw.js"), "utf8");
const code = sw.replace(/^\s*\/\/.*$/gm, "");

test("skipWaiting and clients.claim only on the update bar's message", () => {
  const handler = code.slice(code.indexOf('addEventListener("message"'), code.indexOf('addEventListener("fetch"'));
  const outside = code.replace(handler, "");
  assert.doesNotMatch(outside, /skipWaiting\(/);
  assert.doesNotMatch(outside, /clients\.claim\(/);
  assert.match(handler, /skip-waiting/);
});

test("every precached file exists", () => {
  const list = JSON.parse(code.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  for (const url of list) {
    if (url === "/") continue;
    assert.ok(existsSync(join(SITE, url)), `${url} is precached but missing`);
  }
  for (const f of readdirSync(join(SITE, "i18n")).filter((f) => f !== "check-keys.js")) {
    assert.ok(list.includes(`/i18n/${f}`), `/i18n/${f} isn't precached`);
  }
  for (const f of readdirSync(join(SITE, "js"))) assert.ok(list.includes(`/js/${f}`), `/js/${f} isn't precached`);
});

test("the MapLibre version is the same everywhere", () => {
  const dir = readdirSync(join(SITE, "vendor")).find((d) => d.startsWith("maplibre-"));
  for (const f of ["sw.js", "index.html", "js/map-save.js"]) assert.ok(readFileSync(join(SITE, f), "utf8").includes(`/vendor/${dir}/`), `${f} names another MapLibre`);
});
