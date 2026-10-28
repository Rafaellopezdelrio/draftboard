// prefsConfig contract:
//   - Every toggle in SECTIONS points at a BOOLEAN pref (PreferencesView
//     casts prefs[item.key] to boolean and renders a checkbox), and no pref
//     is listed twice.
//   - Every i18n key (section titles, item label/detail, preset
//     label/description) resolves in BOTH locale bundles.
//   - Presets only force boolean prefs; the "silent" preset really turns
//     every LCU auto-action off.
//   - matchesQuery matches the RESOLVED text (label or detail), trimmed and
//     case-insensitive; an empty query matches everything.

import { describe, it, expect } from "vitest";
import { SECTIONS, PRESETS, matchesQuery } from "./prefsConfig";
import { DEFAULT_PREFS } from "../../state/prefsStore";
import esBundle from "../../i18n/locales/es.json";
import enBundle from "../../i18n/locales/en.json";

function lookup(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      bundle
    );
}

function allI18nKeys(): string[] {
  const keys: string[] = [];
  for (const sec of SECTIONS) {
    keys.push(sec.title);
    for (const it of sec.items) {
      keys.push(it.label);
      if (it.detail) keys.push(it.detail);
    }
  }
  for (const p of PRESETS) keys.push(p.label, p.description);
  return keys;
}

describe("SECTIONS", () => {
  it("only references boolean prefs", () => {
    const nonBool = SECTIONS.flatMap((s) => s.items)
      .filter((it) => typeof DEFAULT_PREFS[it.key] !== "boolean")
      .map((it) => it.key);
    expect(nonBool).toEqual([]);
  });

  it("never lists the same pref twice", () => {
    const keys = SECTIONS.flatMap((s) => s.items.map((it) => it.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("flags exactly the LCU auto-apply rune/spell toggles as danger", () => {
    const danger = SECTIONS.flatMap((s) => s.items)
      .filter((it) => it.danger)
      .map((it) => it.key)
      .sort();
    expect(danger).toEqual(["autoApplyOnHover", "autoApplyRunes", "autoApplySpells"]);
  });
});

describe("i18n keys", () => {
  it.each([
    ["es", esBundle],
    ["en", enBundle],
  ])("every section/item/preset key resolves to a non-empty string in %s", (_loc, bundle) => {
    const missing = allI18nKeys().filter((k) => {
      const v = lookup(bundle, k);
      return typeof v !== "string" || v.trim() === "";
    });
    expect(missing).toEqual([]);
  });
});

describe("PRESETS", () => {
  it("have unique ids and only force boolean prefs", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      for (const [key, value] of Object.entries(p.values)) {
        expect(typeof value).toBe("boolean");
        expect(typeof DEFAULT_PREFS[key as keyof typeof DEFAULT_PREFS]).toBe("boolean");
      }
    }
  });

  it("silent preset turns every LCU auto-action off and enables safe mode", () => {
    const silent = PRESETS.find((p) => p.id === "silent")!;
    expect(silent.values).toMatchObject({
      autoApplyRunes: false,
      autoApplyOnHover: false,
      autoApplySpells: false,
      autoApplyItemSet: false,
      showRuneImportButton: false,
      showSpellImportButton: false,
      safeMode: true,
    });
  });

  it("beginner preset enables beginner mode but never auto-applies on hover", () => {
    const beginner = PRESETS.find((p) => p.id === "beginner")!;
    expect(beginner.values.beginnerMode).toBe(true);
    expect(beginner.values.autoApplyOnHover).toBe(false);
    expect(beginner.values.safeMode).toBe(false);
  });
});

describe("matchesQuery", () => {
  const dict: Record<string, string> = {
    "k.label": "Aplicar Runas al confirmar",
    "k.detail": "Sobrescribe los summoner spells",
  };
  const t = (key: string) => dict[key] ?? key;
  const withDetail = { label: "k.label", detail: "k.detail" };
  const noDetail = { label: "k.label" };

  it("matches everything when the query is empty or whitespace", () => {
    expect(matchesQuery(noDetail, "", t)).toBe(true);
    expect(matchesQuery(noDetail, "   ", t)).toBe(true);
  });

  it("matches the resolved label case-insensitively and trims the query", () => {
    expect(matchesQuery(noDetail, "  RUNAS ", t)).toBe(true);
    expect(matchesQuery(noDetail, "confirmar", t)).toBe(true);
  });

  it("falls back to the resolved detail text", () => {
    expect(matchesQuery(withDetail, "summoner", t)).toBe(true);
    expect(matchesQuery(noDetail, "summoner", t)).toBe(false);
  });

  it("does not match the raw i18n key", () => {
    expect(matchesQuery(withDetail, "k.label", t)).toBe(false);
    expect(matchesQuery(withDetail, "zzz", t)).toBe(false);
  });
});
