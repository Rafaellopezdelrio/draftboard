// TrackingStatusBar contract:
//   - LCU pill: OK/OFF with the connection reason (or default copy) as title.
//   - Draft pill: "<bans>b <picks>p" once the draft store has any pick/ban.
//   - Phase pill: raw gameflow phase or "—".
//   - Live pill: game minute + freshness when the snapshot is < 10s old,
//     "stale Ns" when older, "FALTA" when phase=InProgress but no live data.
//   - A 1s tick re-renders so the freshness counter advances on its own.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TrackingStatusBar } from "./TrackingStatusBar";
import { useDraftStore } from "../state/draftStore";
import type { LiveGameState } from "../hooks/useLiveGame";

const live = vi.hoisted(() => ({ state: { inGame: false, snapshot: null } as unknown }));
vi.mock("../hooks/useLiveGame", () => ({
  useLiveGame: () => live.state,
}));

const NOW = 1_000_000;

function setLive(s: Partial<LiveGameState>) {
  live.state = { inGame: false, snapshot: null, ...s };
}

function snap(gameTime: number) {
  return { gameData: { gameMode: "CLASSIC", gameTime, mapNumber: 11 } } as unknown as LiveGameState["snapshot"];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  useDraftStore.getState().reset();
  setLive({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TrackingStatusBar", () => {
  it("shows LCU OFF, empty draft, no phase and idle live when nothing is connected", () => {
    render(<TrackingStatusBar lcuStatus={{ connected: false }} gamePhase={null} />);

    const lcu = screen.getByTitle("Cliente LoL no detectado");
    expect(lcu).toHaveTextContent("LCUOFF");
    expect(lcu).toHaveClass("text-bad");

    const draft = screen.getByTitle(/Sin datos de champ select/);
    expect(draft).toHaveTextContent("Draft—");
    expect(draft).toHaveClass("text-white/45");

    const phase = screen.getByTitle("Gameflow phase del LCU: no detectada");
    expect(phase).toHaveTextContent("Fase—");

    const liveEl = screen.getByTitle("Live Client API solo activo durante partida real");
    expect(liveEl).toHaveTextContent("Live—");
  });

  it("uses the LCU reason as title when provided, and default copy when connected", () => {
    const { rerender } = render(
      <TrackingStatusBar lcuStatus={{ connected: false, reason: "lockfile missing" }} gamePhase={null} />
    );
    expect(screen.getByTitle("lockfile missing")).toHaveTextContent("OFF");

    rerender(<TrackingStatusBar lcuStatus={{ connected: true }} gamePhase="Lobby" />);
    const lcu = screen.getByTitle("Cliente LoL detectado");
    expect(lcu).toHaveTextContent("LCUOK");
    expect(lcu).toHaveClass("text-good");
    const phase = screen.getByTitle("Gameflow phase del LCU: Lobby");
    expect(phase).toHaveTextContent("FaseLobby");
    expect(phase).toHaveClass("text-accent");
  });

  it("counts picks and bans from the draft store", () => {
    const s = useDraftStore.getState();
    s.setPick("ally", 0, "266");
    s.setPick("enemy", 2, "64");
    s.setPick("enemy", 3, "1");
    s.setBan("ally", 0, "10");

    render(<TrackingStatusBar lcuStatus={{ connected: true }} gamePhase="ChampSelect" />);
    const draft = screen.getByTitle("1 bans + 3 picks detectados");
    expect(draft).toHaveTextContent("Draft1b 3p");
    expect(draft).toHaveClass("text-good");
  });

  it("treats bans alone (enemy side) as draft data", () => {
    useDraftStore.getState().setBan("enemy", 0, "10");
    render(<TrackingStatusBar lcuStatus={{ connected: true }} gamePhase="ChampSelect" />);
    expect(screen.getByTitle("1 bans + 0 picks detectados")).toHaveTextContent("1b 0p");
  });

  it("shows game minute and freshness for a fresh live snapshot, and the tick advances it", () => {
    setLive({ inGame: true, snapshot: snap(312), snapshotAt: NOW - 3000 });
    render(<TrackingStatusBar lcuStatus={{ connected: true }} gamePhase="InProgress" />);

    const liveEl = screen.getByTitle("Live Client API respondiendo OK");
    expect(liveEl).toHaveTextContent("Live5m (3s)");
    expect(liveEl).toHaveClass("text-good");
    expect(liveEl.querySelector("svg")).toHaveClass("animate-pulse");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTitle("Live Client API respondiendo OK")).toHaveTextContent("5m (5s)");
  });

  it("flips to stale once the snapshot is 10s or older", () => {
    setLive({ inGame: true, snapshot: snap(600), snapshotAt: NOW - 9000 });
    render(<TrackingStatusBar lcuStatus={{ connected: true }} gamePhase="InProgress" />);
    expect(screen.getByTitle("Live Client API respondiendo OK")).toHaveTextContent("10m (9s)");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const liveEl = screen.getByTitle(/Snapshot live > 10s sin refrescar/);
    expect(liveEl).toHaveTextContent("Livestale 10s");
    expect(liveEl).toHaveClass("text-meh");
  });

  it("flags missing live data when the phase is InProgress but no game is detected", () => {
    setLive({ inGame: false });
    render(<TrackingStatusBar lcuStatus={{ connected: true }} gamePhase="InProgress" />);
    const liveEl = screen.getByTitle(/Phase=InProgress pero no recibimos datos/);
    expect(liveEl).toHaveTextContent("LiveFALTA");
    expect(liveEl).toHaveClass("text-bad");
  });

  it("clears its tick interval on unmount", () => {
    const { unmount } = render(<TrackingStatusBar lcuStatus={{ connected: true }} gamePhase={null} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
