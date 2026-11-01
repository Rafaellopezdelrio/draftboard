// AppFooter contract:
//   - Version pill shows "Draftboard v<version>": Tauri getVersion() when in
//     Tauri, compile-time fallback otherwise or when getVersion fails.
//   - Health pill reflects useHealthStatus (dot color per level, aria-label
//     with label + detail) and opens Diagnostics on click.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppFooter } from "./AppFooter";
import type { HealthStatus } from "../hooks/useHealthStatus";

const h = vi.hoisted(() => ({
  health: { level: "ok", label: "OK", detail: "Todo en orden" } as HealthStatus,
  getVersion: vi.fn(),
}));
vi.mock("../hooks/useHealthStatus", () => ({ useHealthStatus: () => h.health }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: h.getVersion }));

const versionBtn = () => screen.getByTitle("Ver novedades de esta versión");

beforeEach(() => {
  h.health = { level: "ok", label: "OK", detail: "Todo en orden" };
  h.getVersion.mockReset();
});

describe("AppFooter", () => {
  describe("in Tauri", () => {
    // setup.ts defines __TAURI_INTERNALS__ on globalThis, so isTauri() is true here.
    it("shows the version reported by the running binary", async () => {
      h.getVersion.mockResolvedValue("9.9.9");
      render(<AppFooter />);
      expect(await screen.findByText("Draftboard v9.9.9")).toBeInTheDocument();
      expect(h.getVersion).toHaveBeenCalledTimes(1);
    });

    it("keeps the compile-time fallback when getVersion rejects", async () => {
      h.getVersion.mockRejectedValue(new Error("ipc down"));
      render(<AppFooter />);
      const initial = versionBtn().textContent;
      expect(initial).toMatch(/^Draftboard v\S+$/);
      await vi.waitFor(() => expect(h.getVersion).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(versionBtn().textContent).toBe(initial);
    });
  });

  describe("outside Tauri", () => {
    let saved: PropertyDescriptor | undefined;
    beforeEach(() => {
      saved = Object.getOwnPropertyDescriptor(globalThis, "__TAURI_INTERNALS__");
      delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
    });
    afterEach(() => {
      if (saved) Object.defineProperty(globalThis, "__TAURI_INTERNALS__", saved);
    });

    it("never calls getVersion", async () => {
      render(<AppFooter />);
      // The Tauri path goes through a dynamic import, which takes more than
      // one microtask: wait a macrotask so a missing isTauri() guard would show.
      await new Promise((r) => setTimeout(r, 50));
      expect(h.getVersion).not.toHaveBeenCalled();
      expect(versionBtn().textContent).toMatch(/^Draftboard v/);
    });
  });

  it("wires version and health pills to their callbacks and shows the disclaimer", () => {
    h.getVersion.mockResolvedValue("1.0.0");
    const onShowChangelog = vi.fn();
    const onShowDiagnostics = vi.fn();
    render(<AppFooter onShowChangelog={onShowChangelog} onShowDiagnostics={onShowDiagnostics} />);

    fireEvent.click(versionBtn());
    expect(onShowChangelog).toHaveBeenCalledTimes(1);

    const pill = screen.getByRole("button", { name: "Estado: OK. Todo en orden" });
    expect(pill).toHaveAttribute("title", "Todo en orden");
    fireEvent.click(pill);
    expect(onShowDiagnostics).toHaveBeenCalledTimes(1);

    expect(screen.getByText(/No endorsado por Riot Games/)).toBeInTheDocument();
  });

  it.each([
    ["ok", "bg-good", "ring-good/30"],
    ["degraded", "bg-meh", "ring-meh/30"],
    ["offline", "bg-bad", "ring-bad/30"],
  ] as const)("renders level %s with dot %s and ring %s", (level, dot, ring) => {
    h.getVersion.mockResolvedValue("1.0.0");
    h.health = { level, label: "Estado X", detail: "detalle" };
    render(<AppFooter />);
    const pill = screen.getByRole("button", { name: "Estado: Estado X. detalle" });
    expect(pill).toHaveClass(ring);
    expect(pill.querySelector("[aria-hidden='true']")).toHaveClass(dot);
    expect(pill).toHaveTextContent("Estado X");
  });
});
