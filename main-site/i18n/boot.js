// The i18n entry point (docs/i18n-retrofit-spec.md 10.1): the runtime started with every
// language, and the switcher button mounted where the page has [data-language-switcher].
// js/app.js imports this first, so every string the app builds has its language by then.
import { init } from "./i18n.js";
import { locales, registry } from "./locales.js";
import { mountSwitcher } from "./switcher.js";

init({ locales, registry });
mountSwitcher(document.querySelector("[data-language-switcher]"));
