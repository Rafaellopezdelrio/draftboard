// i18n bootstrap. Wires i18next + react-i18next so any component can
// pull translated strings via `useTranslation()`.
//
// Locale source of truth: `prefs.uiLocale` (defaults to "es"). Changing
// the pref calls `setUiLocale()` below which loads that locale (lazy)
// then calls `i18n.changeLanguage`.
//
// Lazy-load design: locale JSON bundles are loaded on demand via
// dynamic import. Only the active locale ships in the bundle for first
// paint — the other languages are separate chunks fetched when the
// user picks them. Saves ~15-30 KB per inactive locale in the main
// bundle.
//
// Convention for keys: dot-notation by domain.
//   "draft.suggestion.confidence" -> "Confianza"
//   "history.empty.title"         -> "Sin partidas todavía"

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export type UiLocale = "es" | "en";

export const SUPPORTED_LOCALES: readonly UiLocale[] = ["es", "en"];

/** Display labels for the locale picker. Self-language so users always
 * recognise their own. */
export const LOCALE_LABELS: Record<UiLocale, string> = {
  es: "Español",
  en: "English",
};

let initialized = false;
const loadedBundles = new Set<UiLocale>();

/** Dynamically import a locale bundle and register it with i18next.
 * Vite splits these into separate chunks (one per language). */
async function loadLocale(locale: UiLocale): Promise<void> {
  if (loadedBundles.has(locale)) return;
  let bundle: { default: Record<string, unknown> };
  switch (locale) {
    case "es":
      bundle = await import("./locales/es.json");
      break;
    case "en":
      bundle = await import("./locales/en.json");
      break;
    default:
      return; // unknown locale — defensive no-op
  }
  i18n.addResourceBundle(locale, "translation", bundle.default, true, true);
  loadedBundles.add(locale);
}

/** Initialise i18next once at app boot. Loads ONLY the initial locale
 * bundle (others are fetched on demand by `setUiLocale`). Idempotent. */
export async function initI18n(initialLocale: UiLocale = "es"): Promise<void> {
  if (initialized) return;
  initialized = true;
  await i18n.use(initReactI18next).init({
    resources: {}, // populated below
    lng: initialLocale,
    fallbackLng: "es",
    interpolation: {
      escapeValue: false, // React already escapes
    },
    saveMissing: false,
  });
  // Load the initial locale + fallback so missing-key resolution works
  // immediately. Fallback ("es") is the default; if it's also the
  // active locale, the dedupe inside loadLocale makes this a no-op.
  await loadLocale(initialLocale);
  if (initialLocale !== "es") {
    // Don't await the fallback — first paint can use just the active
    // locale; if a key is missing we re-render once the fallback lands.
    void loadLocale("es");
  }
}

// Monotonic token so out-of-order async completions can't revert the locale.
// Each call claims the next token; after the (async) bundle load only the
// most-recent caller is allowed to flip changeLanguage. Prevents a stale
// setUiLocale("es") that started first but resolved last from clobbering a
// newer setUiLocale("en").
let localeRequestSeq = 0;

/** Imperatively change the UI locale. Fetches the bundle (if not yet
 * loaded) then flips i18next's active language — every
 * `useTranslation()` subscriber re-renders on the next tick. Race-safe:
 * if a newer call arrives while this one is loading its bundle, this one
 * yields and does NOT change the language. */
export async function setUiLocale(locale: UiLocale): Promise<void> {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  const myToken = ++localeRequestSeq;
  await loadLocale(locale);
  // A newer request superseded us while the bundle was loading — bail.
  if (myToken !== localeRequestSeq) return;
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
}

/** Current active locale. Useful for non-component code (e.g. when
 * formatting a server-side message that needs language context). */
export function getUiLocale(): UiLocale {
  return (i18n.language as UiLocale) ?? "es";
}

export { i18n };
