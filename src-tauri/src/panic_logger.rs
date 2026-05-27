// Routes Rust panics through `log::error!` so they end up in the
// rotated draftboard.log file alongside frontend JS errors. Without
// this, panics print to stderr and vanish — invisible to users and
// impossible to triage from a bug report.

/// Install a custom panic hook. Falls back to the default hook after
/// logging so the panic still crashes the thread (we don't want to
/// silently swallow corruption).
pub fn install_panic_logger() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown>".into());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic>".into());
        log::error!("[PANIC] at {location}: {payload}");
        default_hook(info);
    }));
}
