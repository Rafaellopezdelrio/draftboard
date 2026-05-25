// Export / import user preferences as a portable JSON file.
//
// Why this exists alongside the SQLite backup:
//   - DB backup ships EVERYTHING (matches, prefs, scout data). Big,
//     opaque, can't be edited.
//   - Prefs export ships ONLY user-configurable knobs. Small, readable,
//     editable in any text editor, easy to diff between machines.
//   - Migration story: paste JSON into Discord / GitHub gist, friend
//     restores their setup in one click.
//
// Security posture:
//   - API keys (groqApiKey, geminiApiKey, anthropicApiKey) are
//     REDACTED by default. The user has to explicitly opt into
//     `includeSecrets: true` if they're exporting for their own backup.
//   - On import, redacted keys (the literal string "***REDACTED***")
//     are dropped instead of overwriting the user's current keys with
//     placeholder garbage.
//
// Schema versioning:
//   - Every export carries `schemaVersion`. The importer rejects
//     anything with a version it doesn't understand so we never apply
//     a future-shape payload to an old build.

import { DEFAULT_PREFS, type Preferences } from "../state/prefsStore";

/** Bump when the exported shape changes in a way that breaks older
 * importers (e.g. a key is renamed or its type changes). */
export const PREFS_EXPORT_SCHEMA_VERSION = 1;

/** Sentinel value used in place of a real secret when exporting without
 * `includeSecrets`. The importer recognises this and drops the key
 * instead of clobbering the user's existing value. */
export const REDACTED_PLACEHOLDER = "***REDACTED***";

/** Keys whose values are secret-bearing. Listed explicitly so a new
 * pref doesn't accidentally leak when we add it — TypeScript catches
 * the keyof Preferences typing if a key gets renamed. */
const SECRET_KEYS: ReadonlyArray<keyof Preferences> = [
  "groqApiKey",
  "geminiApiKey",
  "anthropicApiKey",
];

/** Keys that are NEVER exported regardless of opts. These are
 * session-local state (acceptance timestamps, last-shown versions,
 * overlay offsets) that would corrupt the new machine's state if
 * imported. */
const NEVER_EXPORT: ReadonlyArray<keyof Preferences> = [
  "termsAcceptedAt",
  "termsAcceptedVersion",
  "lastChangelogVersionShown",
  "overlayOffsetX",
  "overlayOffsetY",
  "onboardingDone",
  "fullscreenWarningAck",
];

export interface ExportOptions {
  /** When true, real secret values are included in the export. Use
   * for self-backup only — never share the resulting file. Defaults
   * to false. */
  includeSecrets?: boolean;
}

export interface PrefsExportEnvelope {
  /** Magic identifier so the importer can quickly reject foreign
   * JSON (e.g. user picked the wrong file). */
  app: "draftboard";
  schemaVersion: number;
  /** ISO-8601 UTC. Informational only — used in error messages and
   * for the user to know when they made the backup. */
  exportedAt: string;
  prefs: Partial<Preferences>;
}

/** Serialise the current prefs into a JSON-stringifiable envelope.
 * Secret keys are redacted by default; opt in via includeSecrets. */
export function exportPrefs(
  current: Preferences,
  opts: ExportOptions = {}
): PrefsExportEnvelope {
  const out: Partial<Preferences> = {};
  // Copy every known pref except the NEVER_EXPORT ones.
  for (const key of Object.keys(DEFAULT_PREFS) as Array<keyof Preferences>) {
    if (NEVER_EXPORT.includes(key)) continue;
    if (SECRET_KEYS.includes(key) && !opts.includeSecrets) {
      // Only redact if the value is actually set — empty string can pass
      // through unchanged (it's not a secret leak).
      const v = current[key];
      if (typeof v === "string" && v.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (out as any)[key] = REDACTED_PLACEHOLDER;
        continue;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[key] = current[key];
  }
  return {
    app: "draftboard",
    schemaVersion: PREFS_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    prefs: out,
  };
}

/** Pretty-printed JSON for file write. 2-space indent so the file is
 * readable / editable by a human. */
export function exportPrefsToJson(
  current: Preferences,
  opts: ExportOptions = {}
): string {
  return JSON.stringify(exportPrefs(current, opts), null, 2);
}

export type ImportResult =
  | { ok: true; applied: Partial<Preferences>; ignored: string[] }
  | { ok: false; error: string };

/** Parse + validate + sanitise a JSON envelope. Returns the prefs
 * delta the caller should apply (e.g. via `set` calls), plus a list
 * of keys that were dropped (unknown keys, redacted secrets, type
 * mismatches). NEVER throws — all failure cases return ok:false. */
export function importPrefs(jsonText: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "El archivo no contiene un objeto JSON" };
  }
  const env = parsed as Partial<PrefsExportEnvelope>;
  if (env.app !== "draftboard") {
    return {
      ok: false,
      error: "El archivo no parece de Draftboard (falta el campo 'app')",
    };
  }
  if (
    typeof env.schemaVersion !== "number" ||
    env.schemaVersion > PREFS_EXPORT_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      error: `Versión de esquema no soportada: ${env.schemaVersion}`,
    };
  }
  if (!env.prefs || typeof env.prefs !== "object") {
    return { ok: false, error: "El archivo no contiene 'prefs'" };
  }

  const applied: Partial<Preferences> = {};
  const ignored: string[] = [];
  const incoming = env.prefs as Record<string, unknown>;

  for (const [key, value] of Object.entries(incoming)) {
    // Reject keys that aren't part of the known shape — protects against
    // a malformed or future-schema payload silently poisoning the store.
    if (!(key in DEFAULT_PREFS)) {
      ignored.push(`${key} (desconocida)`);
      continue;
    }
    const typed = key as keyof Preferences;
    if (NEVER_EXPORT.includes(typed)) {
      ignored.push(`${key} (no importable)`);
      continue;
    }
    // Redacted secrets must NOT overwrite the user's current value.
    if (
      SECRET_KEYS.includes(typed) &&
      typeof value === "string" &&
      value === REDACTED_PLACEHOLDER
    ) {
      ignored.push(`${key} (redactada)`);
      continue;
    }
    // Type-check against the default's type. We don't have full schema
    // metadata, so we compare typeof — sufficient to catch JSON-injection
    // of objects where we expect booleans/strings/numbers.
    const expectedType = typeof DEFAULT_PREFS[typed];
    if (typeof value !== expectedType && value !== null) {
      ignored.push(`${key} (tipo incorrecto)`);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (applied as any)[typed] = value;
  }

  return { ok: true, applied, ignored };
}
