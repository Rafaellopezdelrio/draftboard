// XSS hardening tests for ChampionGuideView.stripHtml().
//
// stripHtml() runs over LLM-produced markdown that we render via
// dangerouslySetInnerHTML. A bypass here = arbitrary script execution in the
// app — including the LCU-connected webview that can poke localhost endpoints.
// These tests pin down the sanitizer against the OWASP XSS cheat-sheet
// vectors most likely to slip past a regex-only strip.

import { describe, it, expect } from "vitest";
import { __testOnly_stripHtml as stripHtml } from "./ChampionGuideView";

describe("stripHtml — XSS sanitization", () => {
  it("removes <script> entirely including content", () => {
    const out = stripHtml(`hello <script>alert(1)</script> world`);
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/alert/);
  });

  it("removes <iframe> including src attribute", () => {
    const out = stripHtml(`<iframe src="javascript:alert(1)"></iframe>safe`);
    expect(out).not.toMatch(/iframe/i);
    expect(out).toContain("safe");
  });

  it("strips inline event handlers (onclick, onerror, onmouseover)", () => {
    const cases = [
      `<b onclick="alert(1)">x</b>`,
      `<b onerror='evil()'>y</b>`,
      `<b onmouseover=foo()>z</b>`,
    ];
    for (const html of cases) {
      const out = stripHtml(html);
      expect(out).not.toMatch(/on\w+\s*=/i);
      expect(out).not.toMatch(/alert|evil|foo/);
    }
  });

  it("strips javascript: URLs in href/src/action", () => {
    const out = stripHtml(`<a href="javascript:alert(1)">click</a>`);
    expect(out).not.toMatch(/javascript:/i);
  });

  it("strips data: and vbscript: URLs", () => {
    const out1 = stripHtml(`<a href="data:text/html,<script>alert(1)</script>">x</a>`);
    expect(out1).not.toMatch(/data:/i);
    const out2 = stripHtml(`<a href="vbscript:msgbox(1)">x</a>`);
    expect(out2).not.toMatch(/vbscript:/i);
  });

  it("removes <img> entirely (could carry onerror payload)", () => {
    const out = stripHtml(`<img src=x onerror=alert(1)>`);
    expect(out).not.toMatch(/img/i);
    expect(out).not.toMatch(/onerror|alert/);
  });

  it("removes <style>, <link>, <meta>, <object>, <embed>", () => {
    const cases = [
      `<style>@import url(evil.css)</style>`,
      `<link rel=stylesheet href=evil.css>`,
      `<meta http-equiv=refresh content=0;url=evil>`,
      `<object data=evil.swf></object>`,
      `<embed src=evil.swf>`,
    ];
    for (const html of cases) {
      const out = stripHtml(html);
      expect(out).not.toMatch(/style|link|meta|object|embed/i);
    }
  });

  it("removes <form>, <input>, <button> (could submit creds)", () => {
    const out = stripHtml(
      `<form action=//evil.com><input name=p><button>go</button></form>`
    );
    expect(out).not.toMatch(/form|input|button/i);
  });

  it("keeps allowed formatting tags (<b>, <i>, <strong>, <em>, <p>, <ul>, <li>, <br>, <span>)", () => {
    const out = stripHtml(
      `<p>hello <b>bold</b> <i>italic</i> <strong>s</strong> <em>e</em></p><ul><li>a</li></ul><br>`
    );
    expect(out).toContain("<b>");
    expect(out).toContain("<i>");
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain("<p>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>");
    expect(out).toContain("<br>");
  });

  it("strips disallowed tags but KEEPS their text content", () => {
    const out = stripHtml(`<h1>title</h1><div>content</div>`);
    expect(out).not.toMatch(/<h1|<div/i);
    expect(out).toContain("title");
    expect(out).toContain("content");
  });

  it("plain text passes through untouched", () => {
    expect(stripHtml("just text")).toBe("just text");
    expect(stripHtml("")).toBe("");
  });

  it("handles mixed-case tag attempts (<SCRIPT>, <ScRiPt>)", () => {
    expect(stripHtml(`<SCRIPT>alert(1)</SCRIPT>`)).not.toMatch(/script/i);
    expect(stripHtml(`<ScRiPt>alert(1)</ScRiPt>`)).not.toMatch(/script/i);
  });

  it("handles nested injection attempts", () => {
    const out = stripHtml(`<<script>script>alert(1)<</script>/script>`);
    expect(out).not.toMatch(/alert/);
  });

  it("strips attributes from ALLOWED tags (style/class survive on kept tags otherwise)", () => {
    const out = stripHtml(`<span style="background:url(x)" class="evil">t</span>`);
    expect(out).not.toMatch(/style|class|background/i);
    expect(out).toContain("t");
    expect(out).toContain("<span>");
  });

  it("preserves a validated color attribute (DDragon ability coloring) but nothing else", () => {
    const out = stripHtml(`<font color="#ff0000" style="x" onmouseover="evil()">dmg</font>`);
    expect(out).toContain('color="#ff0000"');
    expect(out).not.toMatch(/style|onmouseover|evil/i);
    expect(out).toContain("dmg");
  });

  it("rejects a non-color-shaped color value (no script/expression smuggling)", () => {
    const out = stripHtml(`<span color="expression(alert(1))">t</span>`);
    expect(out).not.toMatch(/expression|alert/);
    expect(out).toContain("<span>");
  });
});
