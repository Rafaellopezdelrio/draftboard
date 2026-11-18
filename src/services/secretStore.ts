// At-rest encryption of saved keys (Windows DPAPI). On disk a secret is
// stored as "dpapi:<base64>", decryptable only by this Windows user on this
// machine. Plaintext values from older versions still load, and callers
// re-encrypt them right away (isPlaintextSecret) instead of waiting for the
// player to save again — before 0.6.4 they could stay readable for ever.

import { invoke } from "@tauri-apps/api/core";

const DPAPI_PREFIX = "dpapi:";

export async function protectSecret(plaintext: string): Promise<string> {
  try {
    const blob = await invoke<string>("dpapi_protect", { plaintext });
    return DPAPI_PREFIX + blob;
  } catch (e) {
    // Fail open on encryption: a persisted plaintext key beats a lost key.
    // eslint-disable-next-line no-console
    console.warn("[secrets] dpapi_protect failed — storing plaintext:", e);
    return plaintext;
  }
}

export async function unprotectSecret(stored: string): Promise<string> {
  if (!stored.startsWith(DPAPI_PREFIX)) return stored; // legacy plaintext
  try {
    return await invoke<string>("dpapi_unprotect", {
      ciphertextB64: stored.slice(DPAPI_PREFIX.length),
    });
  } catch (e) {
    // Fail closed on decryption: an undecryptable blob (user profile change,
    // tampering) yields an empty key — the UI simply asks for the key again.
    // eslint-disable-next-line no-console
    console.warn("[secrets] dpapi_unprotect failed — key reset:", e);
    return "";
  }
}

/** A non-empty value saved before encryption existed. */
export function isPlaintextSecret(stored: string): boolean {
  return stored !== "" && !stored.startsWith(DPAPI_PREFIX);
}
