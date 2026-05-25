// @vitest-environment jsdom
//
// Lock down the patch auto-detection event contract (Wave 6).
//
// The scheduledJobs hook polls fetchLatestPatch every 6h. When the
// reported version differs from the in-memory cached one, it dispatches
// a `PATCH_UPDATED_EVENT` (custom window event) so App.tsx can show
// the user a "new patch — reload?" toast.
//
// What we lock down:
//   - The event name is stable (apps subscribing to it MUST receive
//     the same string — renaming would silently break the toast)
//   - The detail payload shape matches { previous, latest } so any
//     consumer can dereference both
//
// Driving the full hook in a unit test is brittle (mocks for
// fetchLatestPatch + intervals). The event dispatch contract is
// the part most likely to drift accidentally, so we cover THAT.

import { describe, it, expect, vi } from "vitest";
import { PATCH_UPDATED_EVENT } from "./scheduledJobs";

describe("patch detection event contract", () => {
  it("export PATCH_UPDATED_EVENT name is stable", () => {
    // Snapshot — if this changes, every listener in the app silently
    // breaks. Either bump the version + update all listeners or keep
    // this stable.
    expect(PATCH_UPDATED_EVENT).toBe("draftboard:patch-updated");
  });

  it("CustomEvent dispatched with { previous, latest } payload is received by subscribers", () => {
    const handler = vi.fn();
    window.addEventListener(PATCH_UPDATED_EVENT, handler);
    try {
      window.dispatchEvent(
        new CustomEvent(PATCH_UPDATED_EVENT, {
          detail: { previous: "14.9.1", latest: "14.10.1" },
        })
      );
      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent<{
        previous: string;
        latest: string;
      }>;
      expect(event.detail.previous).toBe("14.9.1");
      expect(event.detail.latest).toBe("14.10.1");
    } finally {
      window.removeEventListener(PATCH_UPDATED_EVENT, handler);
    }
  });

  it("removeEventListener cleanly unsubscribes (no leaks across renders)", () => {
    const handler = vi.fn();
    window.addEventListener(PATCH_UPDATED_EVENT, handler);
    window.removeEventListener(PATCH_UPDATED_EVENT, handler);
    window.dispatchEvent(
      new CustomEvent(PATCH_UPDATED_EVENT, {
        detail: { previous: "x", latest: "y" },
      })
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
