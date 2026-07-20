// Windows DPAPI wrappers for at-rest encryption of the user's BYO AI keys
// (Groq / Anthropic / Gemini). The keys used to sit in the SQLite prefs table
// in plaintext; the TS prefs layer now routes them through these commands so
// what lands on disk is a DPAPI blob only decryptable by this Windows user on
// this machine. No password to manage — DPAPI derives from the user's logon
// credentials (same mechanism browsers use for cookie encryption).
//
// Non-Windows builds (CI runs the Rust suite on Linux) get stubs that return
// an error; the TS side only invokes these under Tauri on Windows.

// FFI to DPAPI requires unsafe (raw blob pointers + LocalFree) — same policy
// carve-out as overlay.rs; every block carries a SAFETY comment.
#[cfg(windows)]
#[allow(unsafe_code)]
mod win {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    fn blob_of(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        }
    }

    /// Copy the API-allocated out-blob into a Vec and LocalFree it.
    ///
    /// SAFETY: `out` must come from a successful CryptProtectData /
    /// CryptUnprotectData call, which allocates pbData with LocalAlloc.
    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(
            out.pbData as *mut core::ffi::c_void,
        )));
        bytes
    }

    pub fn protect(plaintext: &str) -> Result<String, String> {
        let input = blob_of(plaintext.as_bytes());
        let mut out = CRYPT_INTEGER_BLOB::default();
        // SAFETY: input blob points at live plaintext bytes for the call's
        // duration; out blob is freed in `take`.
        unsafe {
            CryptProtectData(&input, None, None, None, None, 0, &mut out)
                .map_err(|e| format!("CryptProtectData: {e}"))?;
            Ok(B64.encode(take(out)))
        }
    }

    pub fn unprotect(b64: &str) -> Result<String, String> {
        let raw = B64.decode(b64).map_err(|e| format!("base64: {e}"))?;
        let input = blob_of(&raw);
        let mut out = CRYPT_INTEGER_BLOB::default();
        // SAFETY: as above.
        unsafe {
            CryptUnprotectData(&input, None, None, None, None, 0, &mut out)
                .map_err(|e| format!("CryptUnprotectData: {e}"))?;
            String::from_utf8(take(out)).map_err(|e| format!("utf8: {e}"))
        }
    }
}

/// Encrypt a secret with the current Windows user's DPAPI scope. Returns
/// base64 of the protected blob.
#[tauri::command]
pub fn dpapi_protect(plaintext: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        win::protect(&plaintext)
    }
    #[cfg(not(windows))]
    {
        let _ = plaintext;
        Err("dpapi unavailable on this platform".into())
    }
}

/// Decrypt a base64 DPAPI blob produced by `dpapi_protect`.
#[tauri::command]
pub fn dpapi_unprotect(ciphertext_b64: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        win::unprotect(&ciphertext_b64)
    }
    #[cfg(not(windows))]
    {
        let _ = ciphertext_b64;
        Err("dpapi unavailable on this platform".into())
    }
}

#[cfg(all(test, windows))]
#[allow(clippy::expect_used)] // tests may panic on failure — that IS the assertion
mod tests {
    use super::win;

    #[test]
    fn roundtrip_preserves_the_secret() {
        let secret = "gsk_live_abc123-ñ€"; // non-ASCII survives too
        let blob = win::protect(secret).expect("protect");
        assert_ne!(blob, secret);
        assert_eq!(win::unprotect(&blob).expect("unprotect"), secret);
    }

    #[test]
    fn tampered_blob_fails_closed() {
        assert!(win::unprotect("bm90LWEtZHBhcGktYmxvYg==").is_err());
    }
}
