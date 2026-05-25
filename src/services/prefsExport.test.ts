// Pin down the prefs export/import contract:
//   - Secrets are redacted by default, opt-in to include
//   - NEVER_EXPORT keys are dropped (terms acceptance, overlay offsets)
//   - Importer validates envelope shape (app, schemaVersion, prefs)
//   - Unknown keys are reported as ignored, not applied
//   - Redacted secrets on import don't clobber existing values
//   - Type mismatches are rejected per-key (defence vs malicious JSON)
//   - Roundtrip preserves non-secret, non-session prefs

import { describe, it, expect } from "vitest";
import { DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import {
  exportPrefs,
  exportPrefsToJson,
  importPrefs,
  PREFS_EXPORT_SCHEMA_VERSION,
  REDACTED_PLACEHOLDER,
} from "./prefsExport";

function mkPrefs(over: Partial<Preferences> = {}): Preferences {
  return { ...DEFAULT_PREFS, ...over };
}

describe("exportPrefs — envelope shape", () => {
  it("includes app, schemaVersion, exportedAt, prefs", () => {
    const env = exportPrefs(mkPrefs());
    expect(env.app).toBe("draftboard");
    expect(env.schemaVersion).toBe(PREFS_EXPORT_SCHEMA_VERSION);
    expect(typeof env.exportedAt).toBe("string");
    expect(env.exportedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(env.prefs).toBeDefined();
  });

  it("redacts API keys by default", () => {
    const env = exportPrefs(
      mkPrefs({
        groqApiKey: "gsk_real_key_xyz",
        anthropicApiKey: "sk-ant-real",
        geminiApiKey: "real_gemini",
      })
    );
    expect(env.prefs.groqApiKey).toBe(REDACTED_PLACEHOLDER);
    expect(env.prefs.anthropicApiKey).toBe(REDACTED_PLACEHOLDER);
    expect(env.prefs.geminiApiKey).toBe(REDACTED_PLACEHOLDER);
  });

  it("includes real secrets when includeSecrets:true", () => {
    const env = exportPrefs(mkPrefs({ groqApiKey: "real" }), {
      includeSecrets: true,
    });
    expect(env.prefs.groqApiKey).toBe("real");
  });

  it("leaves empty secret strings as empty (not redacted)", () => {
    // Empty string is the default — nothing to leak, no need to redact.
    const env = exportPrefs(mkPrefs({ groqApiKey: "" }));
    expect(env.prefs.groqApiKey).toBe("");
  });

  it("strips session-local NEVER_EXPORT keys", () => {
    const env = exportPrefs(
      mkPrefs({
        termsAcceptedAt: 1234567,
        termsAcceptedVersion: 1,
        lastChangelogVersionShown: "0.3.0",
        overlayOffsetX: 100,
        overlayOffsetY: 200,
        onboardingDone: true,
        fullscreenWarningAck: true,
      })
    );
    expect(env.prefs).not.toHaveProperty("termsAcceptedAt");
    expect(env.prefs).not.toHaveProperty("termsAcceptedVersion");
    expect(env.prefs).not.toHaveProperty("lastChangelogVersionShown");
    expect(env.prefs).not.toHaveProperty("overlayOffsetX");
    expect(env.prefs).not.toHaveProperty("overlayOffsetY");
    expect(env.prefs).not.toHaveProperty("onboardingDone");
    expect(env.prefs).not.toHaveProperty("fullscreenWarningAck");
  });

  it("preserves non-secret, non-session prefs verbatim", () => {
    const env = exportPrefs(
      mkPrefs({
        showSuggestions: false,
        compactMode: true,
        proPlayDaysWindow: 90,
        aiProvider: "anthropic",
        dpmTier: "diamond_plus",
      })
    );
    expect(env.prefs.showSuggestions).toBe(false);
    expect(env.prefs.compactMode).toBe(true);
    expect(env.prefs.proPlayDaysWindow).toBe(90);
    expect(env.prefs.aiProvider).toBe("anthropic");
    expect(env.prefs.dpmTier).toBe("diamond_plus");
  });
});

describe("exportPrefsToJson", () => {
  it("returns indented JSON parseable back into the envelope", () => {
    const text = exportPrefsToJson(mkPrefs({ compactMode: true }));
    expect(text).toContain("\n  "); // 2-space indent present
    const parsed = JSON.parse(text);
    expect(parsed.app).toBe("draftboard");
    expect(parsed.prefs.compactMode).toBe(true);
  });
});

describe("importPrefs — validation", () => {
  it("rejects non-JSON text", () => {
    const r = importPrefs("{not valid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON inválido/);
  });

  it("rejects JSON that isn't an object", () => {
    expect(importPrefs("123").ok).toBe(false);
    expect(importPrefs("null").ok).toBe(false);
  });

  it("rejects envelope without the draftboard magic", () => {
    const r = importPrefs(
      JSON.stringify({ app: "other", schemaVersion: 1, prefs: {} })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/draftboard/i);
  });

  it("rejects future schema versions", () => {
    const r = importPrefs(
      JSON.stringify({
        app: "draftboard",
        schemaVersion: 99999,
        prefs: { compactMode: true },
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/esquema/);
  });

  it("rejects envelope without a prefs object", () => {
    const r = importPrefs(
      JSON.stringify({ app: "draftboard", schemaVersion: 1 })
    );
    expect(r.ok).toBe(false);
  });
});

describe("importPrefs — payload sanitisation", () => {
  it("applies known prefs and reports unknown keys as ignored", () => {
    const r = importPrefs(
      JSON.stringify({
        app: "draftboard",
        schemaVersion: 1,
        prefs: { compactMode: true, totallyMadeUpKey: 42 },
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied.compactMode).toBe(true);
    expect(r.ignored.some((s) => s.includes("totallyMadeUpKey"))).toBe(true);
  });

  it("drops NEVER_EXPORT keys even if present in payload", () => {
    const r = importPrefs(
      JSON.stringify({
        app: "draftboard",
        schemaVersion: 1,
        prefs: { termsAcceptedAt: 12345, overlayOffsetX: 999 },
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied).not.toHaveProperty("termsAcceptedAt");
    expect(r.applied).not.toHaveProperty("overlayOffsetX");
    expect(r.ignored.some((s) => s.includes("termsAcceptedAt"))).toBe(true);
  });

  it("drops redacted secrets (does not clobber existing user value)", () => {
    const r = importPrefs(
      JSON.stringify({
        app: "draftboard",
        schemaVersion: 1,
        prefs: { groqApiKey: REDACTED_PLACEHOLDER },
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied).not.toHaveProperty("groqApiKey");
    expect(r.ignored.some((s) => s.includes("groqApiKey"))).toBe(true);
  });

  it("accepts real secrets when present (self-restore path)", () => {
    const r = importPrefs(
      JSON.stringify({
        app: "draftboard",
        schemaVersion: 1,
        prefs: { groqApiKey: "real_value" },
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied.groqApiKey).toBe("real_value");
  });

  it("rejects per-key type mismatches", () => {
    const r = importPrefs(
      JSON.stringify({
        app: "draftboard",
        schemaVersion: 1,
        prefs: { compactMode: "not a boolean" },
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied).not.toHaveProperty("compactMode");
    expect(r.ignored.some((s) => s.includes("compactMode"))).toBe(true);
  });
});

describe("export -> import roundtrip", () => {
  it("preserves all non-secret, non-session prefs", () => {
    const original = mkPrefs({
      compactMode: true,
      proPlayDaysWindow: 60,
      aiProvider: "anthropic",
      aiCoachLanguage: "en",
      metaSource: "dpm",
      dpmTier: "platinum_plus",
    });
    const json = exportPrefsToJson(original);
    const r = importPrefs(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied.compactMode).toBe(true);
    expect(r.applied.proPlayDaysWindow).toBe(60);
    expect(r.applied.aiProvider).toBe("anthropic");
    expect(r.applied.aiCoachLanguage).toBe("en");
    expect(r.applied.metaSource).toBe("dpm");
    expect(r.applied.dpmTier).toBe("platinum_plus");
  });

  it("with includeSecrets:true, roundtrip preserves API keys", () => {
    const original = mkPrefs({ groqApiKey: "gsk_xxx", anthropicApiKey: "sk-yyy" });
    const json = exportPrefsToJson(original, { includeSecrets: true });
    const r = importPrefs(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied.groqApiKey).toBe("gsk_xxx");
    expect(r.applied.anthropicApiKey).toBe("sk-yyy");
  });
});
