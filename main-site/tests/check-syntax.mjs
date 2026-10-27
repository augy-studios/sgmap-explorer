// node --check on every JavaScript file the site and its API ship (not the vendored MapLibre).
// Run: npm run check (from main-site).
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "vendor", ".vercel"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(name)) files.push(p);
  }
})(site);
let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (err) {
    bad++;
    console.error(`${relative(site, f)}:\n${err.stderr}`);
  }
}
console.log(`${files.length - bad} of ${files.length} files pass node --check.`);
process.exit(bad ? 1 : 0);
