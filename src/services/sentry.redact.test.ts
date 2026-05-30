// Security regression test: secrets must never survive into a Sentry payload.
import { describe, it, expect, vi } from "vitest";

// sentry.ts calls Sentry.init side effects on import paths we don't want here;
// the redactor itself is pure, so mock the SDK to a no-op shell.
vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  ErrorBoundary: () => null,
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTags: vi.fn(),
  setUser: vi.fn(),
  close: vi.fn(),
  getCurrentScope: () => ({ setTag: vi.fn() }),
}));

import { __testOnly_redactSecrets as redact } from "./sentry";

describe("redactSecrets — no API key reaches Sentry", () => {
  it("redacts the Gemini key from a ?key= URL (the real leak vector)", () => {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyA1b2C3d4E5f6G7h8I9";
    const out = redact(url);
    expect(out).not.toContain("AIzaSyA1b2C3d4E5f6G7h8I9");
    expect(out).toContain("key=***");
  });

  it("redacts Riot, Anthropic and Groq keys anywhere in a string", () => {
    expect(redact("RGAPI-12345678-1234-1234-1234-123456789012")).toBe("RGAPI-***");
    expect(redact("Authorization: sk-ant-abcdefghijklmnopqrstuvwxyz")).toContain(
      "sk-ant-***"
    );
    expect(redact("key gsk_AbCdEf123456")).toContain("gsk_***");
  });

  it("backstops generic key=/token=/api_key= params", () => {
    expect(redact("https://x.dev/?token=supersecretvalue")).toContain("token=***");
    expect(redact("https://x.dev/?api_key=abc123def456")).toContain("api_key=***");
  });

  it("leaves non-secret text untouched", () => {
    const s = "GET https://ddragon.leagueoflegends.com/cdn/16.10/data/en_US/champion.json";
    expect(redact(s)).toBe(s);
  });
});
