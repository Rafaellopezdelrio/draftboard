// Multi-provider AI client. Default: Groq (free, fast, no card).
// Falls back to Anthropic (paid, best quality) or Google Gemini (free tier).

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getRiotProxyUrl } from "./riotApi";
import { i18n } from "../i18n";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
const httpFetch: typeof fetch = (input, init) =>
  isTauri()
    ? (tauriFetch as unknown as typeof fetch)(input, init)
    : fetch(input, init);

export type AiProvider = "groq" | "anthropic" | "gemini";

export interface AiCallParams {
  provider: AiProvider;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

const ENDPOINTS: Record<AiProvider, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
};

const MODELS: Record<AiProvider, string> = {
  groq: "llama-3.3-70b-versatile",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-2.0-flash",
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  groq: "Groq (gratis, Llama 3.3 70B)",
  anthropic: "Anthropic (Claude — pago)",
  gemini: "Google Gemini (gratis con cuota)",
};

export const PROVIDER_SIGNUP_URLS: Record<AiProvider, string> = {
  groq: "https://console.groq.com/keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/app/apikey",
};

export async function callAi(p: AiCallParams): Promise<string> {
  // Groq via proxy: works WITHOUT user-supplied key. Proxy injects the
  // shared production Groq key (CF secret). This is the "casual user" path.
  const proxyUrl = getRiotProxyUrl();
  if (p.provider === "groq" && proxyUrl) {
    return callGroqViaProxy(p, proxyUrl);
  }
  if (!p.apiKey?.trim()) {
    throw new Error(
      `Necesitas una API key de ${PROVIDER_LABELS[p.provider]}. Configúrala en Prefs.`
    );
  }
  switch (p.provider) {
    case "groq":
      return callOpenAiCompatible(p);
    case "anthropic":
      return callAnthropic(p);
    case "gemini":
      return callGemini(p);
  }
}

async function callGroqViaProxy(p: AiCallParams, proxyUrl: string): Promise<string> {
  const messages = [
    { role: "system", content: p.systemPrompt },
    ...(p.history ?? []),
    { role: "user", content: p.userPrompt },
  ];
  const res = await httpFetch(`${proxyUrl}/groq/openai/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELS.groq,
      max_tokens: p.maxTokens ?? 700,
      messages,
    }),
  });
  if (res.status === 429) throw new Error("Demasiadas peticiones, espera 1 min");
  if (!res.ok)
    throw new Error(
      `AI Coach (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices[0]?.message?.content ?? "";
}

async function callOpenAiCompatible(p: AiCallParams): Promise<string> {
  const messages = [
    { role: "system", content: p.systemPrompt },
    ...(p.history ?? []),
    { role: "user", content: p.userPrompt },
  ];
  const res = await httpFetch(ENDPOINTS.groq, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: MODELS.groq,
      max_tokens: p.maxTokens ?? 700,
      messages,
    }),
  });
  if (res.status === 401) throw new Error(i18n.t("serviceErrors.groqInvalid"));
  if (res.status === 429) throw new Error(i18n.t("serviceErrors.groqRateLimit"));
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices[0]?.message?.content ?? "";
}

async function callAnthropic(p: AiCallParams): Promise<string> {
  const messages = [
    ...(p.history ?? []),
    { role: "user" as const, content: p.userPrompt },
  ];
  const res = await httpFetch(ENDPOINTS.anthropic, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": p.apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODELS.anthropic,
      max_tokens: p.maxTokens ?? 700,
      system: p.systemPrompt,
      messages,
    }),
  });
  if (res.status === 401) throw new Error(i18n.t("serviceErrors.anthropicInvalid"));
  if (res.status === 429) throw new Error(i18n.t("serviceErrors.anthropicRateLimit"));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return json.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

async function callGemini(p: AiCallParams): Promise<string> {
  const url = `${ENDPOINTS.gemini}?key=${encodeURIComponent(p.apiKey.trim())}`;
  const contents = [
    ...(p.history ?? []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: p.userPrompt }] },
  ];
  const res = await httpFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: p.maxTokens ?? 700 },
    }),
  });
  if (res.status === 401 || res.status === 403) throw new Error(i18n.t("serviceErrors.geminiInvalid"));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ?? "";
}
