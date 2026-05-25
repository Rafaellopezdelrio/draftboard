// Tests the LoL window-mode classifier predicate. The Win32 detection runs
// in Rust (`detect_lol_window_mode`), but the React side has the
// overlay-compat predicate that drives the warning banner.

import { describe, it, expect } from "vitest";
import { overlayCompatibleMode } from "./useLoLWindowMode";

describe("overlayCompatibleMode", () => {
  it("windowed is compatible (caption bar present, overlays sit on top)", () => {
    expect(overlayCompatibleMode("windowed")).toBe(true);
  });

  it("borderless is compatible (no caption but still DWM-composited)", () => {
    expect(overlayCompatibleMode("borderless")).toBe(true);
  });

  it("fullscreen-exclusive is NOT compatible (DXGI owns the swap chain)", () => {
    expect(overlayCompatibleMode("fullscreen-exclusive")).toBe(false);
  });

  it("not-running is NOT compatible (nothing to overlay)", () => {
    expect(overlayCompatibleMode("not-running")).toBe(false);
  });

  it("unknown is NOT compatible (fail-safe — don't promise overlay works)", () => {
    expect(overlayCompatibleMode("unknown")).toBe(false);
  });
});
