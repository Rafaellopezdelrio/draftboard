import { describe, it, expect } from "vitest";
import {
  validateRiotIdName,
  validateRiotIdTag,
  validateProxyUrl,
  validateRiotApiKey,
  validateAiKey,
} from "./inputValidation";
// Static import — was previously a dynamic `await import()` inside each
// test, which under full-suite parallel load could stretch to 5s+ and
// blow the default test timeout (regression first seen 2026-05-21).
import { __testOnly_stripHtml as stripHtml } from "../components/ChampionGuideView";

describe("input validation — security defense layer", () => {
  describe("validateRiotIdName", () => {
    it("accepts normal Riot IDs", () => {
      expect(validateRiotIdName("Faker")).toBe("Faker");
      expect(validateRiotIdName("NâmikâzëMinâtöö")).toBe("NâmikâzëMinâtöö");
    });

    it("trims surrounding whitespace", () => {
      expect(validateRiotIdName("  Faker  ")).toBe("Faker");
    });

    it("rejects empty", () => {
      expect(() => validateRiotIdName("")).toThrow();
      expect(() => validateRiotIdName("   ")).toThrow();
    });

    it("rejects HTML/SQL injection attempts", () => {
      expect(() => validateRiotIdName("<script>")).toThrow();
      expect(() => validateRiotIdName("'; DROP TABLE")).toThrow();
      expect(() => validateRiotIdName("../etc/passwd")).toThrow();
    });

    it("rejects too long (>32 chars)", () => {
      expect(() => validateRiotIdName("a".repeat(33))).toThrow();
    });
  });

  describe("validateRiotIdTag", () => {
    it("accepts alphanumeric tags", () => {
      expect(validateRiotIdTag("EUW")).toBe("EUW");
      expect(validateRiotIdTag("004")).toBe("004");
      expect(validateRiotIdTag("KR1")).toBe("KR1");
    });

    it("rejects special chars (injection-safe)", () => {
      expect(() => validateRiotIdTag("EUW!")).toThrow();
      expect(() => validateRiotIdTag("../")).toThrow();
      expect(() => validateRiotIdTag("E W")).toThrow();
    });

    it("rejects too long", () => {
      expect(() => validateRiotIdTag("ABCDEFGHIJ")).toThrow();
    });
  });

  describe("validateProxyUrl", () => {
    it("accepts valid HTTPS Cloudflare Worker URL", () => {
      expect(validateProxyUrl("https://x.workers.dev")).toBe("https://x.workers.dev");
    });

    it("strips trailing slash", () => {
      expect(validateProxyUrl("https://x.workers.dev/")).toBe("https://x.workers.dev");
    });

    it("empty is OK (proxy disabled)", () => {
      expect(validateProxyUrl("")).toBe("");
      expect(validateProxyUrl("  ")).toBe("");
    });

    it("rejects http:// (insecure)", () => {
      expect(() => validateProxyUrl("http://evil.com")).toThrow(/HTTPS/);
    });

    it("rejects dangerous schemes (XSS protection)", () => {
      expect(() => validateProxyUrl("javascript:alert(1)")).toThrow();
      expect(() => validateProxyUrl("data:text/html,<script>")).toThrow();
      expect(() => validateProxyUrl("file:///etc/passwd")).toThrow();
    });

    it("rejects malformed URLs", () => {
      expect(() => validateProxyUrl("not-a-url")).toThrow();
      expect(() => validateProxyUrl("://broken")).toThrow();
    });
  });

  describe("validateRiotApiKey", () => {
    it("accepts well-formed Riot dev key", () => {
      const k = "RGAPI-12345678-1234-1234-1234-123456789012";
      expect(validateRiotApiKey(k)).toBe(k);
    });

    it("rejects keys missing prefix (catches Groq-key-in-Riot-field bug)", () => {
      expect(() => validateRiotApiKey("gsk_abc123")).toThrow();
      expect(() => validateRiotApiKey("sk-ant-abc")).toThrow();
    });

    it("rejects malformed Riot keys", () => {
      expect(() => validateRiotApiKey("RGAPI-")).toThrow();
      expect(() => validateRiotApiKey("RGAPI-badformat")).toThrow();
    });

    it("empty is OK (means user wants to use proxy)", () => {
      expect(validateRiotApiKey("")).toBe("");
    });
  });

  describe("validateAiKey", () => {
    it("accepts well-formed Groq key", () => {
      const k = "gsk_" + "a".repeat(50);
      expect(validateAiKey("groq", k)).toBe(k);
    });

    it("rejects Groq key in Anthropic slot (paste-mishap protection)", () => {
      expect(() => validateAiKey("anthropic", "gsk_abc123abcdef")).toThrow();
    });

    it("rejects Anthropic key in Groq slot", () => {
      expect(() => validateAiKey("groq", "sk-ant-abc12345678901234567890")).toThrow();
    });

    it("accepts well-formed Gemini key", () => {
      const k = "AIza" + "x".repeat(35);
      expect(validateAiKey("gemini", k)).toBe(k);
    });

    it("empty is OK (means use proxy or skip AI)", () => {
      expect(validateAiKey("groq", "")).toBe("");
    });
  });
});

describe("ChampionGuide stripHtml — XSS defense", () => {
  it("strips <script> tags", async () => {
const out = stripHtml('Hello<script>alert("xss")</script> world');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("strips inline event handlers", async () => {
const out = stripHtml('<span onclick="alert(1)">hi</span>');
    expect(out).not.toContain("onclick");
  });

  it("strips javascript: URLs in href", async () => {
const out = stripHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/href\s*=\s*["']?javascript:/i);
  });

  it("strips iframes / objects / embeds", async () => {
expect(stripHtml('<iframe src="evil.com"></iframe>')).not.toContain("iframe");
    expect(stripHtml('<object data="x"></object>')).not.toContain("object");
  });

  it("keeps allowed formatting tags (br, b, span, etc.)", async () => {
const out = stripHtml("Deals <b>50 damage</b><br>per second");
    expect(out).toContain("<b>");
    expect(out).toContain("<br>");
  });

  it("strips disallowed tags but keeps inner text", async () => {
const out = stripHtml("<table><tr><td>text</td></tr></table>");
    expect(out).not.toMatch(/<\/?table|<\/?tr|<\/?td/);
    expect(out).toContain("text");
  });
});
