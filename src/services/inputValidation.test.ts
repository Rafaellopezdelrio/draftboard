import { describe, it, expect } from "vitest";
import { validateProxyUrl } from "./inputValidation";
// Static import — was previously a dynamic `await import()` inside each
// test, which under full-suite parallel load could stretch to 5s+ and
// blow the default test timeout (regression first seen 2026-05-21).
import { __testOnly_stripHtml as stripHtml } from "../components/ChampionGuideView";

describe("input validation — security defense layer", () => {
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
