// SQLite-backed DB helpers: pure date utilities used by the rolling
// backup + restore commands, plus the unit tests that pin them.
//
// The bigger DB Tauri commands (rolling_db_backup,
// preboot_db_integrity_check_and_quarantine, db_list_auto_backups,
// etc) still live in lib.rs for now because moving them requires
// untangling 11+ Tauri command attributes + their generate_handler!
// references. This module is the first slice of that future split.
//
// What lives here:
//   - epoch_secs_to_ymd: format a UNIX epoch second count as YYYY-MM-DD.
//   - ymd_to_epoch_secs: parse YYYY-MM-DD into the start-of-day epoch.
//   - Tests covering both ends of the conversion + edge cases.
//
// Why: rolling_db_backup() names backups by date and prunes by both
// modified-time AND name-encoded date. Both ends of that comparison
// flow through these two helpers — a bug here would orphan old
// backups OR delete fresh ones. Worth unit-testing in isolation
// rather than relying on integration tests with a real filesystem.

/// Convert UNIX epoch seconds → "YYYY-MM-DD". Uses the civil-from-days
/// algorithm (Howard Hinnant) so we don't pull in `chrono` for one
/// format call. Tested against the boundary cases:
///   - 0 → "1970-01-01" (epoch)
///   - 86399 → "1970-01-01" (last second of day 0)
///   - 86400 → "1970-01-02" (start of day 1)
///   - 1735689600 → "2025-01-01" (modern reference)
pub fn epoch_secs_to_ymd(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    // Hinnant's civil_from_days algorithm — exact, branch-light.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Parse "YYYY-MM-DD" → UNIX epoch seconds (start of day, UTC).
/// Returns `None` for malformed input or invalid calendar dates
/// (e.g. month=13, day=32, Feb 30).
pub fn ymd_to_epoch_secs(ymd: &str) -> Option<u64> {
    let parts: Vec<&str> = ymd.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let y: i64 = parts[0].parse().ok()?;
    let m: u64 = parts[1].parse().ok()?;
    let d: u64 = parts[2].parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // Reverse Hinnant's algorithm.
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days_since_epoch = era * 146_097 + (doe as i64) - 719_468;
    if days_since_epoch < 0 {
        return None;
    }
    Some((days_since_epoch as u64) * 86_400)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)] // unwrap idiomatic in tests
    use super::*;

    #[test]
    fn epoch_zero_is_first_day_of_1970() {
        assert_eq!(epoch_secs_to_ymd(0), "1970-01-01");
    }

    #[test]
    fn epoch_last_second_of_day_zero() {
        assert_eq!(epoch_secs_to_ymd(86_399), "1970-01-01");
    }

    #[test]
    fn epoch_start_of_day_one() {
        assert_eq!(epoch_secs_to_ymd(86_400), "1970-01-02");
    }

    #[test]
    fn epoch_modern_reference_date() {
        // 2025-01-01 00:00:00 UTC
        assert_eq!(epoch_secs_to_ymd(1_735_689_600), "2025-01-01");
    }

    #[test]
    fn ymd_roundtrip_epoch() {
        assert_eq!(ymd_to_epoch_secs("1970-01-01"), Some(0));
    }

    #[test]
    fn ymd_roundtrip_modern() {
        // 2025-01-01 should map back to 1_735_689_600 (UTC midnight)
        assert_eq!(ymd_to_epoch_secs("2025-01-01"), Some(1_735_689_600));
    }

    #[test]
    fn ymd_rejects_invalid_format() {
        assert_eq!(ymd_to_epoch_secs("not-a-date"), None);
        assert_eq!(ymd_to_epoch_secs("2025/01/01"), None);
        assert_eq!(ymd_to_epoch_secs("2025-01"), None);
    }

    #[test]
    fn ymd_rejects_invalid_calendar() {
        assert_eq!(ymd_to_epoch_secs("2025-13-01"), None); // month > 12
        assert_eq!(ymd_to_epoch_secs("2025-00-15"), None); // month = 0
        assert_eq!(ymd_to_epoch_secs("2025-06-00"), None); // day = 0
        assert_eq!(ymd_to_epoch_secs("2025-06-32"), None); // day > 31
    }

    #[test]
    fn full_roundtrip_sample() {
        // Pick a non-trivial date and round-trip through both functions.
        let label = "2024-12-31";
        let secs = ymd_to_epoch_secs(label).unwrap();
        assert_eq!(epoch_secs_to_ymd(secs), label);
    }
}
