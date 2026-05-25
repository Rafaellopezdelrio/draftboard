// Verify toast → Sentry breadcrumb integration. Every push() must emit
// a breadcrumb so subsequent crash reports carry the recent user-facing
// message timeline. Also locks down render contract + auto-dismiss.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastContainer";

// Mock the Sentry module so addBreadcrumb is observable without hitting
// the real SDK (which is no-op without a DSN anyway).
vi.mock("../../services/sentry", () => ({
  addBreadcrumb: vi.fn(),
}));

import { addBreadcrumb } from "../../services/sentry";

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(addBreadcrumb).mockClear();
});

function Harness({
  onReady,
}: {
  onReady?: (push: ReturnType<typeof useToast>["push"]) => void;
}) {
  const { push } = useToast();
  // Single-fire on mount via a tiny effect; the consumer harness drives
  // toasts through a captured reference to push().
  if (onReady) onReady(push);
  return null;
}

describe("ToastContainer breadcrumb integration", () => {
  it("emits a Sentry breadcrumb on every push with matching type + title", () => {
    let pushFn: ReturnType<typeof useToast>["push"] | null = null;
    render(
      <ToastProvider>
        <Harness onReady={(p) => (pushFn = p)} />
      </ToastProvider>
    );
    expect(pushFn).toBeTruthy();
    act(() => {
      pushFn!({ type: "error", title: "Falló la carga" });
    });
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "toast",
        level: "error",
        message: "Falló la carga",
      })
    );
  });

  it("maps warn -> warning + info -> info + success -> info severity", () => {
    let pushFn: ReturnType<typeof useToast>["push"] | null = null;
    render(
      <ToastProvider>
        <Harness onReady={(p) => (pushFn = p)} />
      </ToastProvider>
    );
    act(() => {
      pushFn!({ type: "warn", title: "w" });
      pushFn!({ type: "info", title: "i" });
      pushFn!({ type: "success", title: "s" });
    });
    const calls = vi.mocked(addBreadcrumb).mock.calls.map((c) => c[0].level);
    expect(calls).toEqual(["warning", "info", "info"]);
  });

  it("includes detail (capped to 160 chars) in breadcrumb data", () => {
    let pushFn: ReturnType<typeof useToast>["push"] | null = null;
    render(
      <ToastProvider>
        <Harness onReady={(p) => (pushFn = p)} />
      </ToastProvider>
    );
    const longDetail = "x".repeat(500);
    act(() => {
      pushFn!({ type: "info", title: "T", detail: longDetail });
    });
    const call = vi.mocked(addBreadcrumb).mock.calls[0][0];
    expect(call.data?.detail).toHaveLength(160);
  });

  it("does NOT include data when detail is omitted (keep breadcrumb small)", () => {
    let pushFn: ReturnType<typeof useToast>["push"] | null = null;
    render(
      <ToastProvider>
        <Harness onReady={(p) => (pushFn = p)} />
      </ToastProvider>
    );
    act(() => {
      pushFn!({ type: "info", title: "no detail" });
    });
    const call = vi.mocked(addBreadcrumb).mock.calls[0][0];
    expect(call.data).toBeUndefined();
  });
});

describe("ToastContainer rendering contract", () => {
  it("renders the toast title after push", () => {
    let pushFn: ReturnType<typeof useToast>["push"] | null = null;
    render(
      <ToastProvider>
        <Harness onReady={(p) => (pushFn = p)} />
      </ToastProvider>
    );
    act(() => {
      pushFn!({ type: "success", title: "Listo" });
    });
    expect(screen.getByText("Listo")).toBeInTheDocument();
  });

  it("auto-dismisses after the default duration", () => {
    let pushFn: ReturnType<typeof useToast>["push"] | null = null;
    render(
      <ToastProvider>
        <Harness onReady={(p) => (pushFn = p)} />
      </ToastProvider>
    );
    act(() => {
      pushFn!({ type: "info", title: "Hola" });
    });
    expect(screen.getByText("Hola")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByText("Hola")).toBeNull();
  });

  it("Escape closes the most recent toast", () => {
    let pushFn: ReturnType<typeof useToast>["push"] | null = null;
    render(
      <ToastProvider>
        <Harness onReady={(p) => (pushFn = p)} />
      </ToastProvider>
    );
    act(() => {
      pushFn!({ type: "info", title: "A", durationMs: 0 });
      pushFn!({ type: "info", title: "B", durationMs: 0 });
    });
    expect(screen.getByText("B")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByText("B")).toBeNull();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
