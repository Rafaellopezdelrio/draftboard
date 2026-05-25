// Pin down the input validators that gate user-supplied configuration.
// A loose regex here = junk in the prefs DB and obscure errors at fetch
// time. Lock the contract.

import { describe, it, expect } from "vitest";
import {
  RIOT_PLATFORMS,
  validateProxyUrl,
  validateRiotApiKey,
  validateRiotId,
  validateRiotPlatform,
  validateSafeString,
} from "./validators";

describe("validateRiotApiKey", () => {
  it("rejects empty input", () => {
    const r = validateRiotApiKey("");
    expect(r.ok).toBe(false);
  });

  it("rejects strings missing the RGAPI- prefix", () => {
    const r = validateRiotApiKey("abc-1234-def-5678");
    expect(r.ok).toBe(false);
    expect(r.ok || r.reason).toMatch(/RGAPI-/);
  });

  it("accepts the canonical UUID-style dev key", () => {
    const r = validateRiotApiKey("RGAPI-12345678-1234-1234-1234-123456789abc");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe("RGAPI-12345678-1234-1234-1234-123456789abc");
  });

  it("accepts a loose 30+ char RGAPI-prefixed key (prod variants)", () => {
    const r = validateRiotApiKey("RGAPI-abcdefghijklmnopqrstuvwxyz0123456789");
    expect(r.ok).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    const r = validateRiotApiKey("  RGAPI-12345678-1234-1234-1234-123456789abc\n");
    expect(r.ok).toBe(true);
  });

  it("rejects too-short keys even with prefix", () => {
    const r = validateRiotApiKey("RGAPI-short");
    expect(r.ok).toBe(false);
  });
});

describe("validateRiotPlatform", () => {
  it("accepts every entry in RIOT_PLATFORMS", () => {
    for (const p of RIOT_PLATFORMS) {
      const r = validateRiotPlatform(p);
      expect(r.ok, p).toBe(true);
    }
  });

  it("is case-insensitive (EUW1 → euw1)", () => {
    const r = validateRiotPlatform("EUW1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe("euw1");
  });

  it("rejects empty", () => {
    expect(validateRiotPlatform("").ok).toBe(false);
  });

  it("rejects fake regions", () => {
    expect(validateRiotPlatform("eu").ok).toBe(false);
    expect(validateRiotPlatform("euw").ok).toBe(false);
    expect(validateRiotPlatform("mars1").ok).toBe(false);
  });
});

describe("validateProxyUrl", () => {
  it("empty string is OK (means 'use default proxy')", () => {
    expect(validateProxyUrl("").ok).toBe(true);
  });

  it("rejects HTTP (must be HTTPS)", () => {
    const r = validateProxyUrl("http://example.workers.dev");
    expect(r.ok).toBe(false);
  });

  it("rejects localhost", () => {
    const r = validateProxyUrl("https://localhost:8787");
    expect(r.ok).toBe(false);
  });

  it("rejects query strings (we add our own)", () => {
    const r = validateProxyUrl("https://my-proxy.workers.dev/?key=foo");
    expect(r.ok).toBe(false);
  });

  it("rejects unparseable input", () => {
    const r = validateProxyUrl("not a url");
    expect(r.ok).toBe(false);
  });

  it("accepts a clean Cloudflare worker URL", () => {
    const r = validateProxyUrl("https://my-proxy.workers.dev");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe("https://my-proxy.workers.dev");
  });

  it("strips a trailing slash for consistency", () => {
    const r = validateProxyUrl("https://my-proxy.workers.dev/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.endsWith("/")).toBe(false);
  });
});

describe("validateRiotId", () => {
  it("accepts a canonical name#tag", () => {
    const r = validateRiotId("Faker#KR1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe("Faker#KR1");
  });

  it("rejects when missing hash", () => {
    expect(validateRiotId("Faker").ok).toBe(false);
  });

  it("rejects too-short gameName", () => {
    expect(validateRiotId("Fa#KR1").ok).toBe(false);
  });

  it("rejects too-long gameName (>16)", () => {
    expect(validateRiotId("ThisNameIsTooLong#KR1").ok).toBe(false);
  });

  it("rejects non-alphanumeric tag", () => {
    expect(validateRiotId("Faker#K-R").ok).toBe(false);
  });

  it("accepts a Unicode gameName (Korean letters)", () => {
    const r = validateRiotId("페이커#KR1");
    expect(r.ok).toBe(true);
  });
});

describe("validateSafeString", () => {
  it("rejects HTML angle brackets", () => {
    expect(validateSafeString("hello <script>").ok).toBe(false);
  });

  it("rejects control characters", () => {
    expect(validateSafeString("nul\x00").ok).toBe(false);
  });

  it("enforces min length", () => {
    expect(validateSafeString("a", { minLen: 3 }).ok).toBe(false);
    expect(validateSafeString("abc", { minLen: 3 }).ok).toBe(true);
  });

  it("enforces max length", () => {
    expect(validateSafeString("a".repeat(201), { maxLen: 200 }).ok).toBe(false);
  });

  it("trims whitespace before checking", () => {
    const r = validateSafeString("  ok  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe("ok");
  });
});
