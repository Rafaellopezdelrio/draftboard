import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the HTTP layer. aiProvider's httpFetch routes through
// @tauri-apps/plugin-http's `fetch` when running under Tauri, and the test
// setup marks __TAURI_INTERNALS__ present — so override that module here with
// a controllable mock (this file's vi.mock wins over the setup's).
const httpFetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => httpFetchMock(...args),
}));

// Proxy URL drives the keyless Groq-via-proxy path; default off (direct).
let proxyUrl: string | null = null;
vi.mock("./riotApi", () => ({
  getRiotProxyUrl: () => proxyUrl,
}));

import { callAi, type AiCallParams } from "./aiProvider";

/** Build a minimal Response-shaped object the provider code reads. */
function res(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const base: Omit<AiCallParams, "provider"> = {
  apiKey: "k-123",
  systemPrompt: "sys",
  userPrompt: "hi",
};

describe("callAi — provider dispatch + parsing + error mapping", () => {
  beforeEach(() => {
    proxyUrl = null;
    httpFetchMock.mockReset();
  });

  it("groq (direct): posts to the Groq endpoint with a Bearer key and returns the content", async () => {
    httpFetchMock.mockResolvedValue(
      res(200, { choices: [{ message: { content: "groq says hi" } }] })
    );
    const out = await callAi({ ...base, provider: "groq" });
    expect(out).toBe("groq says hi");
    const [url, init] = httpFetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k-123");
  });

  it("anthropic: posts to the Anthropic endpoint with x-api-key and joins text blocks", async () => {
    httpFetchMock.mockResolvedValue(
      res(200, {
        content: [
          { type: "text", text: "line1" },
          { type: "thinking", text: "ignored" },
          { type: "text", text: "line2" },
        ],
      })
    );
    const out = await callAi({ ...base, provider: "anthropic" });
    expect(out).toBe("line1\nline2");
    const [url, init] = httpFetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k-123");
  });

  it("gemini: puts the key in the query string and extracts candidate text", async () => {
    httpFetchMock.mockResolvedValue(
      res(200, { candidates: [{ content: { parts: [{ text: "gemini out" }] } }] })
    );
    const out = await callAi({ ...base, provider: "gemini" });
    expect(out).toBe("gemini out");
    const [url] = httpFetchMock.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("?key=k-123");
  });

  it("maps 401 to an invalid-key error and 429 to a rate-limit error (groq)", async () => {
    httpFetchMock.mockResolvedValue(res(401, {}));
    await expect(callAi({ ...base, provider: "groq" })).rejects.toThrow(/Groq inválida/i);

    httpFetchMock.mockResolvedValue(res(429, {}));
    await expect(callAi({ ...base, provider: "groq" })).rejects.toThrow(/Rate limit Groq/i);
  });

  it("throws a 'need an API key' error when no key and no proxy", async () => {
    await expect(
      callAi({ ...base, apiKey: "", provider: "groq" })
    ).rejects.toThrow(/Necesitas una API key/i);
    expect(httpFetchMock).not.toHaveBeenCalled();
  });

  it("uses the keyless proxy path for groq when a proxy URL is set", async () => {
    proxyUrl = "https://proxy.example";
    httpFetchMock.mockResolvedValue(
      res(200, { choices: [{ message: { content: "via proxy" } }] })
    );
    const out = await callAi({ ...base, apiKey: "", provider: "groq" });
    expect(out).toBe("via proxy");
    const [url] = httpFetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example/groq/openai/v1/chat/completions");
  });
});

// Live 2026-10-29: Groq retired llama-3.3-70b-versatile and the AI coach went
// silent ("The model ... does not exist"). The model list now falls through.
describe("callAi — Groq model fallback", () => {
  beforeEach(() => {
    proxyUrl = "https://proxy.test";
    httpFetchMock.mockReset();
  });

  const modelOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body).model;

  it("moves to the next model when one is retired", async () => {
    httpFetchMock
      .mockResolvedValueOnce(res(404, { error: { code: "model_not_found", message: "The model `openai/gpt-oss-120b` does not exist" } }))
      .mockResolvedValueOnce(res(200, { choices: [{ message: { content: "qwen answers" } }] }));
    await expect(callAi({ ...base, provider: "groq" })).resolves.toBe("qwen answers");
    expect(httpFetchMock.mock.calls.map(modelOf)).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  });

  it("asks reasoning models for short thinking", async () => {
    httpFetchMock.mockResolvedValue(res(200, { choices: [{ message: { content: "ok" } }] }));
    await callAi({ ...base, provider: "groq" });
    expect(JSON.parse(httpFetchMock.mock.calls[0][1].body).reasoning_effort).toBe("low");
  });

  it("does not fall through on other 400s and surfaces the error", async () => {
    httpFetchMock.mockResolvedValue(res(400, { error: { code: "context_length_exceeded" } }));
    await expect(callAi({ ...base, provider: "groq" })).rejects.toThrow(/AI Coach \(400\).*context_length_exceeded/);
    expect(httpFetchMock).toHaveBeenCalledTimes(1);
  });
});
