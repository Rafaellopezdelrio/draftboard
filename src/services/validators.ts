// Centralised input validators. Single source of truth for "what's a
// valid Riot API key?", "is this a real region?", "is this URL a worker
// proxy?". UI calls these before invoking backends; backends can call
// them too as defensive double-checks.
//
// Design: each validator returns a discriminated union { ok: true } or
// { ok: false; reason }. The reason is user-facing Spanish — drop it
// straight into a Toast or below-input error message.

export type Validation =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

/**
 * Riot developer API keys are formatted `RGAPI-` + 8-4-4-4-12 hex with
 * dashes (UUID-ish). Production keys may look different, so we accept
 * any `RGAPI-` prefix followed by 30+ url-safe chars as a fallback.
 */
export function validateRiotApiKey(input: string): Validation {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: false, reason: "La clave está vacía." };
  if (!trimmed.startsWith("RGAPI-")) {
    return {
      ok: false,
      reason: "Las claves de Riot empiezan por 'RGAPI-'. Pégala completa.",
    };
  }
  const STRICT = /^RGAPI-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const LOOSE = /^RGAPI-[A-Za-z0-9\-_]{30,}$/;
  if (STRICT.test(trimmed) || LOOSE.test(trimmed)) {
    return { ok: true, normalized: trimmed };
  }
  return {
    ok: false,
    reason: "Formato no reconocido. Genera una nueva en developer.riotgames.com.",
  };
}

/**
 * Riot platform routing values. These map regions to the actual API host.
 * The list is fixed by Riot — we hardcode the whitelist instead of
 * trusting whatever the user typed.
 */
export const RIOT_PLATFORMS = [
  "euw1", "eun1", "kr", "na1", "br1", "la1", "la2", "oc1", "tr1", "ru", "jp1",
] as const;
export type RiotPlatform = (typeof RIOT_PLATFORMS)[number];

export function validateRiotPlatform(input: string): Validation {
  const norm = (input ?? "").trim().toLowerCase();
  if (!norm) return { ok: false, reason: "Selecciona una región." };
  if ((RIOT_PLATFORMS as readonly string[]).includes(norm)) {
    return { ok: true, normalized: norm };
  }
  return {
    ok: false,
    reason: `Región desconocida. Válidas: ${RIOT_PLATFORMS.join(", ")}.`,
  };
}

/**
 * Validate a Riot proxy URL — must be HTTPS, a non-empty host, no path
 * traversal, no query strings (we add our own). Used when the user
 * configures a self-hosted CF Worker / their own reverse proxy.
 */
export function validateProxyUrl(input: string): Validation {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: true, normalized: "" }; // empty = "use default"
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "URL inválida. Incluye 'https://' al principio." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "Debe usar HTTPS (no HTTP)." };
  }
  if (!url.hostname || url.hostname === "localhost") {
    return { ok: false, reason: "Hostname inválido." };
  }
  if (url.search) {
    return { ok: false, reason: "No incluyas parámetros (?). Solo el host." };
  }
  // Strip trailing slash for consistency.
  const normalized = url.origin + url.pathname.replace(/\/$/, "");
  return { ok: true, normalized };
}

/**
 * Riot ID format: `gameName#tagLine`. gameName is 3-16 chars, tagLine is
 * 3-5. We accept Unicode game names (Korean/Chinese players).
 */
export function validateRiotId(input: string): Validation {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Vacío." };
  const hash = trimmed.indexOf("#");
  if (hash < 0) {
    return { ok: false, reason: "Formato: nombre#tag (ej: Faker#KR1)." };
  }
  const gameName = trimmed.slice(0, hash);
  const tagLine = trimmed.slice(hash + 1);
  if (gameName.length < 3 || gameName.length > 16) {
    return { ok: false, reason: "El nombre tiene que ser 3-16 caracteres." };
  }
  if (tagLine.length < 3 || tagLine.length > 5) {
    return { ok: false, reason: "El tag tiene que ser 3-5 caracteres." };
  }
  if (!/^[a-zA-Z0-9]+$/.test(tagLine)) {
    return { ok: false, reason: "El tag solo acepta letras y números." };
  }
  return { ok: true, normalized: `${gameName}#${tagLine}` };
}

/**
 * Generic safe-string check — used for things like display names and
 * lobby labels where we don't want HTML/control chars sneaking through.
 */
export function validateSafeString(
  input: string,
  opts: { minLen?: number; maxLen?: number } = {}
): Validation {
  const { minLen = 1, maxLen = 200 } = opts;
  const trimmed = (input ?? "").trim();
  if (trimmed.length < minLen) {
    return { ok: false, reason: `Mínimo ${minLen} caracteres.` };
  }
  if (trimmed.length > maxLen) {
    return { ok: false, reason: `Máximo ${maxLen} caracteres.` };
  }
  // Reject control chars + naive HTML entities.
  if (/[\x00-\x1F\x7F<>]/.test(trimmed)) {
    return { ok: false, reason: "Caracteres no permitidos." };
  }
  return { ok: true, normalized: trimmed };
}
