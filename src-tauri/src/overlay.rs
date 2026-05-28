// Overlay window control + LoL-window inspection. The "overlay" window
// is declared in tauri.conf.json (transparent, always on top, no
// decorations). It stays hidden until the LiveGame hook detects the
// user is in a real LoL match — then we show it as a corner widget.
//
// Click-through lets the cursor pass through the overlay's empty /
// transparent areas to the game underneath. When the user wants to
// interact with the overlay (drag, close, expand) we toggle click-
// through off briefly via a modifier key. Implementation uses Tauri's
// set_ignore_cursor_events.
//
// Non-bannable: every Win32 call here is read-only inspection or a
// standard window-manager call (SetWindowPos, GetWindowLongPtr). No
// process injection, no memory reads, no DLL hooks — same primitives
// any accessibility tool or window manager uses.

// Win32 overlay re-assertion (SetWindowPos / GetForegroundWindow /
// GetWindowLongPtr) requires `unsafe`. Cargo.toml sets unsafe_code = "warn"
// crate-wide so NEW unsafe elsewhere gets flagged; this whole module IS the
// reviewed Win32 wrapper, so scope the allow here (not blanket across crate).
#![allow(unsafe_code)]

use tauri::Manager as _;

#[tauri::command]
pub async fn overlay_set_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    if visible {
        win.show().map_err(|e| e.to_string())?;
        // Re-assert always-on-top in case Windows lost it after focus changes.
        let _ = win.set_always_on_top(true);
    } else {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn overlay_set_clickthrough(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    win.set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn overlay_set_position(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    use tauri::{PhysicalPosition, Position};
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    win.set_position(Position::Physical(PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

/// Resize the overlay window to match the rendered content's bounding box.
/// Lets us "shrink-wrap" the window to the visible chip — pixels outside
/// the chip aren't part of any window, so clicks naturally fall through
/// to LoL underneath. Standard technique used by lightweight overlays
/// that don't want per-pixel hit-test logic.
#[tauri::command]
pub async fn overlay_set_size(
    app: tauri::AppHandle,
    width: u32,
    height: u32,
) -> Result<(), String> {
    use tauri::{LogicalSize, Size};
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    // Clamp to a minimum so the window can never become zero-area
    // (Windows refuses 0×0 and Tauri panics). 40×40 = enough for a small
    // status dot if the content collapses.
    let w = width.max(40);
    let h = height.max(40);
    win.set_size(Size::Logical(LogicalSize {
        width: w as f64,
        height: h as f64,
    }))
    .map_err(|e| e.to_string())
}

/// Find the running LoL game window's HWND. Riot's IN-GAME window uses
/// class `RiotWindowClass` and title `"League of Legends (TM) Client"`;
/// the LAUNCHER/lobby uses different class+title. We always prefer the
/// game window for anchoring (that's where the player is actually
/// playing); fall back to the launcher window when no game is running so
/// the overlay still tracks something useful in champ select.
#[cfg(windows)]
fn find_lol_hwnd() -> Option<windows::Win32::Foundation::HWND> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, IsIconic, IsWindowVisible};

    // Candidate matchers ordered by priority. For each, try class name
    // first (most reliable — survives locale + title changes), then exact
    // title match.
    let candidates: &[(&str, &str)] = &[
        // In-game (real match running)
        ("RiotWindowClass", "League of Legends (TM) Client"),
        // Some patches drop the "(TM) Client" suffix
        ("RiotWindowClass", "League of Legends"),
        // Launcher / client (champ select, lobby, etc.)
        ("RCLIENT", "League of Legends"),
    ];

    let try_find = |class: Option<&str>, title: Option<&str>| -> Option<HWND> {
        let class_buf: Option<Vec<u16>> = class.map(|s| format!("{s}\0").encode_utf16().collect());
        let title_buf: Option<Vec<u16>> = title.map(|s| format!("{s}\0").encode_utf16().collect());
        let class_ptr = class_buf
            .as_ref()
            .map(|v| PCWSTR::from_raw(v.as_ptr()))
            .unwrap_or(PCWSTR::null());
        let title_ptr = title_buf
            .as_ref()
            .map(|v| PCWSTR::from_raw(v.as_ptr()))
            .unwrap_or(PCWSTR::null());
        let hwnd: HWND = unsafe { FindWindowW(class_ptr, title_ptr) }.ok()?;
        if hwnd.0.is_null() {
            return None;
        }
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return None;
        }
        if unsafe { IsIconic(hwnd) }.as_bool() {
            return None;
        }
        Some(hwnd)
    };

    for (class, title) in candidates {
        if let Some(h) = try_find(Some(class), Some(title)) {
            return Some(h);
        }
        // Title-only fallback for the same candidate
        if let Some(h) = try_find(None, Some(title)) {
            return Some(h);
        }
        // Class-only fallback (matches ANY visible LoL window with that class)
        if let Some(h) = try_find(Some(class), None) {
            return Some(h);
        }
    }
    None
}

/// Returns the LoL window's screen rect as `{x, y, width, height}` or
/// `null` (JSON) when the client isn't running / not visible.
///
/// Used by the overlay positioning code to anchor the widget to the
/// top-left corner of LoL's window and follow it when the user drags the
/// game window across monitors.
#[tauri::command]
pub async fn get_lol_window_rect() -> Result<Option<serde_json::Value>, String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

        let hwnd = match find_lol_hwnd() {
            Some(h) => h,
            None => return Ok(None),
        };
        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return Ok(None);
        }

        Ok(Some(serde_json::json!({
            "x": rect.left,
            "y": rect.top,
            "width": rect.right - rect.left,
            "height": rect.bottom - rect.top,
        })))
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

/// Detect which window mode the running LoL client is in. Returns one of:
///   - "not-running"          : no LoL window found
///   - "windowed"             : standard windowed (has WS_CAPTION title bar)
///   - "borderless"           : borderless fullscreen (no caption, covers
///                              monitor, but standard Win32 window — overlays
///                              CAN sit on top)
///   - "fullscreen-exclusive" : exclusive fullscreen via DXGI (overlay
///                              IMPOSSIBLE without injection — we tell the
///                              user to switch to Borderless)
///
/// Detection logic mirrors what Mobalytics/Itero do (visible in their JS
/// bundle): iterate top-level windows, match by title "League of Legends",
/// then inspect window style flags.
#[tauri::command]
pub async fn detect_lol_window_mode() -> Result<String, String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, GWL_STYLE, WS_CAPTION};

        // Reuse the same Win32 finder as the positioning code so we always
        // classify the SAME window we're anchoring to. Previously the mode
        // detector used a title-only match that found the launcher; once
        // the game started, the title changed and we'd report "not-running"
        // even though LoL was clearly open.
        let hwnd = match find_lol_hwnd() {
            Some(h) => h,
            None => return Ok("not-running".to_string()),
        };

        // Read window style flags. WS_CAPTION present = windowed (title bar).
        // No caption = borderless or fullscreen-exclusive — we lump them
        // together as "borderless" since true exclusive detection needs
        // DXGI swap-chain inspection (out of scope) and the user advice
        // is the same in either case.
        let style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
        let has_caption = (style & (WS_CAPTION.0 as isize)) != 0;
        if has_caption {
            Ok("windowed".to_string())
        } else {
            Ok("borderless".to_string())
        }
    }
    #[cfg(not(windows))]
    {
        Ok("not-running".to_string())
    }
}

/// Force the overlay window to the absolute top of the Z-order via
/// SetWindowPos(HWND_TOPMOST). Tauri's `set_always_on_top(true)` only
/// asserts once; Windows demotes us as soon as the LoL window grabs focus.
///
/// Mobalytics/Itero achieve this via the Overwolf SDK; we call the same
/// Win32 primitive directly. No-op on non-Windows platforms.
#[tauri::command]
pub async fn overlay_assert_topmost(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };

        // CRITICAL: do NOT pass SWP_SHOWWINDOW here. A previous version did
        // and it forced the overlay back to visible every 1s, even after
        // setOverlayVisible(false) had hidden it. Result: the overlay
        // permanently floated over the Windows taskbar with clickthrough
        // OFF, swallowing every click in its rectangle. Visibility is
        // owned by setOverlayVisible — this command ONLY re-asserts the
        // z-order via HWND_TOPMOST, nothing else.
        let hwnd: HWND = win.hwnd().map_err(|e| e.to_string())?;
        unsafe {
            SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            )
            .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(windows))]
    {
        // Other platforms: Tauri's own helper is the best we can do.
        let _ = win.set_always_on_top(true);
    }
    Ok(())
}
