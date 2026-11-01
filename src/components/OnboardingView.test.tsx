// OnboardingView contract:
//   - Welcome step: start (detect account) or skip to manual mode.
//   - Start → syncing step: shows "searching" until the sync reports progress,
//     then source/message and a progress bar (only when total > 0).
//   - Sync result → done step with a summary: synced counts, "none" source,
//     or a timeout summary when LCU doesn't answer within 12s.
//   - Skipping (welcome or syncing) → done with the manual summary.
//   - Finish persists onboardingDone=true, then closes.
//
// The "level" step is unreachable (nothing ever sets step="level"), so it is
// not covered here.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { OnboardingView } from "./OnboardingView";
import { usePrefsStore } from "../state/prefsStore";
import type { SyncProgress, SyncResult } from "../services/personalDataSync";

vi.mock("../services/personalDataSync", () => ({ syncPersonalData: vi.fn() }));
vi.mock("../services/lcuService", () => ({ getCurrentSummoner: vi.fn() }));

import { syncPersonalData } from "../services/personalDataSync";
import { getCurrentSummoner } from "../services/lcuService";

const initialState = usePrefsStore.getState();
const setPref = vi.fn(async () => {});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function syncResult(over: Partial<SyncResult> = {}): SyncResult {
  return { matches: 12, masteries: 30, rank: null, source: "LCU", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  usePrefsStore.setState({ set: setPref as never });
});

afterEach(() => {
  cleanup(); // unmount before resetting the store so the reset does not re-render outside act
  usePrefsStore.setState(initialState, true);
  vi.useRealTimers();
});

function setup() {
  const onClose = vi.fn();
  render(<OnboardingView onClose={onClose} />);
  return { onClose };
}

const btn = (name: string | RegExp) => screen.getByRole("button", { name });

describe("OnboardingView — welcome", () => {
  it("renders the welcome copy with start and skip actions", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Bienvenido a LoL Draft Advisor" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("no es baneable")).toBeInTheDocument();
    expect(btn("Empezar — detectar cuenta")).toBeInTheDocument();
    expect(btn("Saltar — usar en modo manual")).toBeInTheDocument();
  });

  it("skip goes straight to done with the manual summary, without syncing", () => {
    setup();
    fireEvent.click(btn("Saltar — usar en modo manual"));
    expect(screen.getByRole("heading", { name: "¡Listo!" })).toBeInTheDocument();
    expect(screen.getByText(/Modo manual activado/)).toBeInTheDocument();
    expect(getCurrentSummoner).not.toHaveBeenCalled();
    expect(syncPersonalData).not.toHaveBeenCalled();
  });

  it("finish persists onboardingDone before closing", async () => {
    const save = deferred<void>();
    setPref.mockImplementationOnce(() => save.promise);
    const { onClose } = setup();
    fireEvent.click(btn("Saltar — usar en modo manual"));
    fireEvent.click(btn("Empezar a usar la app"));
    expect(setPref).toHaveBeenCalledWith("onboardingDone", true);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      save.resolve();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("OnboardingView — syncing", () => {
  it("shows the searching state until progress arrives, then source, message and bar", async () => {
    const sync = deferred<SyncResult>();
    let report: (p: SyncProgress) => void = () => {};
    vi.mocked(getCurrentSummoner).mockResolvedValue(null);
    vi.mocked(syncPersonalData).mockImplementation((onProgress) => {
      report = onProgress!;
      return sync.promise;
    });
    const { container } = render(<OnboardingView onClose={vi.fn()} />);

    await act(async () => {
      fireEvent.click(btn("Empezar — detectar cuenta"));
    });
    expect(screen.getByRole("heading", { name: "Sincronizando..." })).toBeInTheDocument();
    expect(screen.getByText("Buscando cliente de LoL...")).toBeInTheDocument();

    act(() => report({ source: "LCU", done: 1, total: 4, message: "Leyendo partidas" }));
    expect(screen.queryByText("Buscando cliente de LoL...")).not.toBeInTheDocument();
    expect(screen.getByText("LCU")).toBeInTheDocument();
    expect(screen.getByText("Leyendo partidas")).toBeInTheDocument();
    const bar = container.querySelector<HTMLElement>("[style]");
    expect(bar?.style.width).toBe("25%");

    act(() => report({ source: "Riot API", done: 0, total: 0, message: "Conectando" }));
    expect(screen.getByText("Riot API")).toBeInTheDocument();
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("summarises the synced account, counts and source", async () => {
    vi.mocked(getCurrentSummoner).mockResolvedValue({ gameName: "Faker", tagLine: "KR1" } as never);
    vi.mocked(syncPersonalData).mockResolvedValue(syncResult());
    setup();
    await act(async () => {
      fireEvent.click(btn("Empezar — detectar cuenta"));
    });
    expect(screen.getByRole("heading", { name: "¡Listo!" })).toBeInTheDocument();
    expect(
      screen.getByText("Faker#KR1 — 12 partidas + 30 maestrías sincronizadas vía LCU.")
    ).toBeInTheDocument();
  });

  it("falls back to a generic account label when no summoner is known", async () => {
    vi.mocked(getCurrentSummoner).mockResolvedValue(null);
    vi.mocked(syncPersonalData).mockResolvedValue(syncResult({ source: "Riot API", matches: 3, masteries: 0 }));
    setup();
    await act(async () => {
      fireEvent.click(btn("Empezar — detectar cuenta"));
    });
    expect(
      screen.getByText("Cuenta# — 3 partidas + 0 maestrías sincronizadas vía Riot API.")
    ).toBeInTheDocument();
  });

  it("shows the 'client not detected' summary when no source answered", async () => {
    vi.mocked(getCurrentSummoner).mockResolvedValue(null);
    vi.mocked(syncPersonalData).mockResolvedValue(syncResult({ source: "none", matches: 0, masteries: 0 }));
    setup();
    await act(async () => {
      fireEvent.click(btn("Empezar — detectar cuenta"));
    });
    expect(screen.getByText(/No detectamos el cliente de LoL abierto/)).toBeInTheDocument();
  });

  it("gives up after 12s with the timeout summary when LCU never answers", async () => {
    vi.useFakeTimers();
    vi.mocked(getCurrentSummoner).mockReturnValue(new Promise(() => {}));
    setup();
    await act(async () => {
      fireEvent.click(btn("Empezar — detectar cuenta"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_999);
    });
    expect(screen.getByRole("heading", { name: "Sincronizando..." })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("heading", { name: "¡Listo!" })).toBeInTheDocument();
    expect(screen.getByText(/El cliente de LoL no responde/)).toBeInTheDocument();
    expect(syncPersonalData).not.toHaveBeenCalled();
  });

  it("can skip to manual mode while the sync is still running", async () => {
    vi.mocked(getCurrentSummoner).mockReturnValue(new Promise(() => {}));
    setup();
    await act(async () => {
      fireEvent.click(btn("Empezar — detectar cuenta"));
    });
    fireEvent.click(btn("Saltar y usar en modo manual"));
    expect(screen.getByRole("heading", { name: "¡Listo!" })).toBeInTheDocument();
    expect(screen.getByText(/Modo manual activado/)).toBeInTheDocument();
  });

  // Regression: the 12s timeout (or a late sync result) resolving after the
  // user chose manual mode used to overwrite the "Modo manual activado"
  // summary. The manual choice must stick.
  it("keeps the manual summary when the 12s timeout fires after skipping", async () => {
    vi.useFakeTimers();
    vi.mocked(getCurrentSummoner).mockReturnValue(new Promise(() => {}));
    setup();
    await act(async () => {
      fireEvent.click(btn("Empezar — detectar cuenta"));
    });
    fireEvent.click(btn("Saltar y usar en modo manual"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(screen.getByText(/Modo manual activado/)).toBeInTheDocument();
    expect(screen.queryByText(/El cliente de LoL no responde/)).not.toBeInTheDocument();
  });
});
