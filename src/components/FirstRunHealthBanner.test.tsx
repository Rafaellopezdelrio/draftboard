// Locked-down contract for the boot health banner:
//   - Doesn't render before the settle delay (avoids false-positives
//     during the network/LCU race at boot)
//   - Renders ONLY when there's a blocking issue (offline OR backend down)
//   - LCU-not-connected alone is NOT enough to show the banner
//   - Has role=alert + aria-live=polite for screen readers
//   - Dismiss + Diagnostics buttons work

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FirstRunHealthBanner } from "./FirstRunHealthBanner";

vi.mock("../hooks/useNetworkStatus", () => ({
  useNetworkStatus: vi.fn(() => ({
    online: true,
    workerReachable: true,
    ok: true,
    lastOkAt: Date.now(),
    retry: vi.fn(),
  })),
}));

import { useNetworkStatus } from "../hooks/useNetworkStatus";

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(useNetworkStatus).mockReturnValue({
    online: true,
    workerReachable: true,
    ok: true,
    lastOkAt: Date.now(),
    retry: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("FirstRunHealthBanner", () => {
  it("does not render before the settle delay (avoids race-flash)", () => {
    vi.mocked(useNetworkStatus).mockReturnValue({
      online: false,
      workerReachable: false,
      ok: false,
      lastOkAt: null,
      retry: vi.fn(),
    });
    render(
      <FirstRunHealthBanner lcuConnected={false} onShowDiagnostics={() => {}} />
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders after settle when network is offline", () => {
    vi.mocked(useNetworkStatus).mockReturnValue({
      online: false,
      workerReachable: false,
      ok: false,
      lastOkAt: null,
      retry: vi.fn(),
    });
    render(
      <FirstRunHealthBanner lcuConnected={false} onShowDiagnostics={() => {}} />
    );
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "polite");
    expect(alert).toHaveTextContent(/Sin conexión a internet/);
  });

  it("renders when worker probe fails (backend down)", () => {
    vi.mocked(useNetworkStatus).mockReturnValue({
      online: true,
      workerReachable: false,
      ok: false,
      lastOkAt: null,
      retry: vi.fn(),
    });
    render(
      <FirstRunHealthBanner lcuConnected={true} onShowDiagnostics={() => {}} />
    );
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/Backend no responde/);
  });

  it("does NOT render when only LCU is disconnected (informational, not blocking)", () => {
    // Network OK, LCU not connected -> normal state (user hasn't opened LoL).
    // Banner stays hidden.
    render(
      <FirstRunHealthBanner lcuConnected={false} onShowDiagnostics={() => {}} />
    );
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does NOT render when everything is fine", () => {
    render(
      <FirstRunHealthBanner lcuConnected={true} onShowDiagnostics={() => {}} />
    );
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dismiss button hides the banner without firing onShowDiagnostics", () => {
    vi.mocked(useNetworkStatus).mockReturnValue({
      online: false,
      workerReachable: false,
      ok: false,
      lastOkAt: null,
      retry: vi.fn(),
    });
    const onShowDiagnostics = vi.fn();
    render(
      <FirstRunHealthBanner
        lcuConnected={false}
        onShowDiagnostics={onShowDiagnostics}
      />
    );
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onShowDiagnostics).not.toHaveBeenCalled();
  });

  it("Diagnostics button fires the callback", () => {
    vi.mocked(useNetworkStatus).mockReturnValue({
      online: false,
      workerReachable: false,
      ok: false,
      lastOkAt: null,
      retry: vi.fn(),
    });
    const onShowDiagnostics = vi.fn();
    render(
      <FirstRunHealthBanner
        lcuConnected={false}
        onShowDiagnostics={onShowDiagnostics}
      />
    );
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    fireEvent.click(screen.getByRole("button", { name: /Abrir diagnóstico/ }));
    expect(onShowDiagnostics).toHaveBeenCalledTimes(1);
  });
});
