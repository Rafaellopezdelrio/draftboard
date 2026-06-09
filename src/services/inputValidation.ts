// Centralised input validation. Defense-in-depth: even though we don't
// have user-generated content in the traditional sense, we should validate
// anything that comes from a text field before persisting it or putting it
// in a URL/network request.

import { i18n } from "../i18n";

/**
 * Riot ID names (gameName) are 3-16 unicode chars. Tags are 3-5 alphanumeric.
 * We're lenient with unicode but reject injection vectors.
 */
export function validateRiotIdName(name: string): string {
  const cleaned = name.trim();
  if (cleaned.length === 0) {
    throw new Error(i18n.t("serviceErrors.riotIdEmpty"));
  }
  if (cleaned.length > 32) {
    throw new Error(i18n.t("serviceErrors.riotIdTooLong"));
  }
  // Block control chars, common injection vectors (quotes, slashes, brackets,
  // semicolons, backticks).
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F<>"'`;\\/()[\]{}]/.test(cleaned)) {
    throw new Error(i18n.t("serviceErrors.riotIdInvalidChars"));
  }
  // Riot IDs don't contain regular spaces (the client uses non-breaking spaces)
  if (/\s/.test(cleaned)) {
    throw new Error(i18n.t("serviceErrors.riotIdNoSpaces"));
  }
  return cleaned;
}

export function validateRiotIdTag(tag: string): string {
  const cleaned = tag.trim();
  if (cleaned.length === 0) {
    throw new Error(i18n.t("serviceErrors.tagEmpty"));
  }
  if (cleaned.length > 8) {
    throw new Error(i18n.t("serviceErrors.tagTooLong"));
  }
  // Tags are alphanumeric only
  if (!/^[A-Za-z0-9]+$/.test(cleaned)) {
    throw new Error(i18n.t("serviceErrors.tagInvalid"));
  }
  return cleaned;
}

/**
 * The proxy URL goes through fetch — must be a valid HTTPS URL.
 * Block javascript:, data:, file: schemes.
 */
export function validateProxyUrl(url: string): string {
  const cleaned = url.trim().replace(/\/$/, "");
  if (cleaned.length === 0) return "";
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error(i18n.t("serviceErrors.proxyMalformed"));
  }
  if (parsed.protocol !== "https:") {
    throw new Error(i18n.t("serviceErrors.proxyHttps"));
  }
  return parsed.origin;
}

/**
 * Riot API keys start with RGAPI- followed by a UUID.
 */
export function validateRiotApiKey(key: string): string {
  const cleaned = key.trim();
  if (cleaned.length === 0) return "";
  if (!/^RGAPI-[a-f0-9-]{36}$/i.test(cleaned)) {
    throw new Error(i18n.t("serviceErrors.riotKeyInvalid"));
  }
  return cleaned;
}

/**
 * AI provider keys have distinct prefixes. Catch wrong-provider mishaps.
 */
export function validateAiKey(
  provider: "groq" | "anthropic" | "gemini",
  key: string
): string {
  const cleaned = key.trim();
  if (cleaned.length === 0) return "";
  const PATTERNS = {
    groq: /^gsk_[A-Za-z0-9]{30,}$/,
    anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    gemini: /^AIza[A-Za-z0-9_-]{30,}$/,
  };
  if (!PATTERNS[provider].test(cleaned)) {
    throw new Error(i18n.t("serviceErrors.aiKeyInvalid", { provider }));
  }
  return cleaned;
}
