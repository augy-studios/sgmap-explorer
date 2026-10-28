// Every language the app ships, as static JSON imports: all of them in memory before the first
// render, so switching is instant and works offline. en.json is the source of truth; every other
// file has exactly its keys (check-keys.js). Adding a language is one import line, one entry in
// `locales` and one in `registry`, and the file in sw.js's precache list.
import en from "./en.json" with { type: "json" };
import zh from "./zh-SG.json" with { type: "json" };
import ms from "./ms-SG.json" with { type: "json" };
import ta from "./ta-SG.json" with { type: "json" };

export const locales = { en, zh, ms, ta };

export const registry = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "zh", name: "中文", dir: "ltr" },
  { code: "ms", name: "Bahasa Melayu", dir: "ltr" },
  { code: "ta", name: "தமிழ்", dir: "ltr" }
];
