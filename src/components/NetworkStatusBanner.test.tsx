// NetworkStatusBanner contract: hidden while ok; otherwise shows the reason
// (offline / backend down / limited), the matching detail, an optional
// "last connection" relative time, and a retry button that spins for at
// least UI_FEEDBACK_MS.retrySpinnerMin.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NetworkStatusBanner } from "./NetworkStatusBanner";
import { UI_FEEDBACK_MS } from "../config";
import type { NetworkStatus } from "../hooks/useNetworkStatus";

const h = vi.hoisted(() => ({ net: {} as NetworkStatus }));
vi.mock("../hooks/useNetworkStatus", () => ({ useNetworkStatus: () => h.net }));

const NOW = 10_000_000;

function setNet(over: Partial<NetworkStatus>) {
  h.net = {
    online: true,
    workerReachable: true,
    ok: false,
    lastOkAt: null,
    retry: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setNet({});
});
afterEach(() => {
  vi.useRealTimers();
});

describe("NetworkStatusBanner", () => {
  it("renders nothing when the network is ok", () => {
    setNet({ ok: true });
    const { container } = render(<NetworkStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the offline reason and cached-data detail", () => {
    setNet({ online: false, workerReachable: false });
    render(<NetworkStatusBanner />);
    expect(screen.getByText("Sin conexión a Internet")).toBeInTheDocument();
    expect(screen.getByText(/Mostrando datos en caché/)).toBeInTheDocument();
    expect(screen.queryByText(/Última conexión/)).not.toBeInTheDocument();
  });

  it("shows backend-down with the stale-data detail when online but the worker is unreachable", () => {
    setNet({ workerReachable: false });
    render(<NetworkStatusBanner />);
    expect(screen.getByText("Backend no disponible")).toBeInTheDocument();
    expect(screen.getByText(/Tier list, builds y pro-data/)).toBeInTheDocument();
  });

  it("falls back to 'limited' when online and worker reachable but not ok", () => {
    render(<NetworkStatusBanner />);
    expect(screen.getByText("Conexión limitada")).toBeInTheDocument();
  });

  it.each([
    [30_000, "hace 30s"],
    [5 * 60_000, "hace 5min"],
    [2 * 3_600_000 + 59 * 60_000, "hace 2h"],
  ])("formats a last-ok %ims ago as '%s'", (ago, text) => {
    setNet({ workerReachable: false, lastOkAt: NOW - ago });
    render(<NetworkStatusBanner />);
    expect(screen.getByText(`· Última conexión ${text}`)).toBeInTheDocument();
  });

  it("retries and keeps the spinner for the minimum feedback time", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    setNet({ workerReachable: false, retry });
    render(<NetworkStatusBanner />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(retry).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole("button", { name: "..." });
    expect(busy).toBeDisabled();
    expect(busy.querySelector("svg")).toHaveClass("animate-spin");

    act(() => {
      vi.advanceTimersByTime(UI_FEEDBACK_MS.retrySpinnerMin - 1);
    });
    expect(screen.getByRole("button", { name: "..." })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });
});
