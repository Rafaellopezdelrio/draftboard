// Centralised input validation. Defense-in-depth: even though we don't
// have user-generated content in the traditional sense, we should validate
// anything that comes from a text field before persisting it or putting it
// in a URL/network request.

import { i18n } from "../i18n";

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
