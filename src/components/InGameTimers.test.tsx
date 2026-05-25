// Component test for the recently-rewritten InGameTimers.
//
// Two modes:
//   1. Static fallback when Live Client API not reachable (out-of-game / pre-2999)
//   2. Live dynamic countdown when useLiveGame returns a snapshot
//
// We mock useLiveGame at the module boundary so we don't need a real LoL
// running. RTL renders the tree; we assert against the visible text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the data hook BEFORE importing the component so the mock binding wins.
const mockState = { inGame: false, snapshot: null as unknown };
vi.mock("../hooks/useLiveGame", () => ({
  useLiveGame: () => mockState,
  useLiveGameTime: () => (mockState.snapshot
    ? (mockState.snapshot as { gameData: { gameTime: number } }).gameData.gameTime
    : 0),
}));

import { InGameTimers } from "./InGameTimers";

describe("InGameTimers — static fallback (no live data)", () => {
  beforeEach(() => {
    mockState.inGame = false;
    mockState.snapshot = null;
  });

  it("renders the 4 canonical objectives with first-spawn minutes", () => {
    render(<InGameTimers />);
    expect(screen.getByText(/Drake/)).toBeInTheDocument();
    expect(screen.getByText(/Herald/)).toBeInTheDocument();
    expect(screen.getByText(/Baron/)).toBeInTheDocument();
    expect(screen.getByText(/Atakhan/)).toBeInTheDocument();
    expect(screen.getByText(/1ª spawn: 5min/)).toBeInTheDocument();
    expect(screen.getByText(/1ª spawn: 14min/)).toBeInTheDocument();
    expect(screen.getByText(/1ª spawn: 25min/)).toBeInTheDocument();
  });

  it("shows the static reference tip", () => {
    render(<InGameTimers />);
    expect(screen.getByText(/Wardea río 30s antes del spawn/)).toBeInTheDocument();
  });
});

describe("InGameTimers — live mode", () => {
  beforeEach(() => {
    mockState.inGame = true;
    mockState.snapshot = {
      gameData: { gameTime: 200, gameMode: "CLASSIC", mapNumber: 11 },
      events: [],
      allPlayers: [],
      activePlayer: null,
    };
  });

  it("renders a header with the live game clock when in game", () => {
    render(<InGameTimers />);
    // 200s = 3:20
    expect(screen.getByText(/3:20/)).toBeInTheDocument();
  });

  it("Drake at 200s shows countdown ~1:40 (first spawn 5min - elapsed)", () => {
    render(<InGameTimers />);
    // 5min - 3:20 = 1:40
    expect(screen.getByText(/Próximo: 1:40/)).toBeInTheDocument();
  });

  it("when Drake already killed, shows last-kill timestamp + next-spawn ETA", () => {
    mockState.snapshot = {
      gameData: { gameTime: 400, gameMode: "CLASSIC", mapNumber: 11 },
      events: [{ EventID: 1, EventName: "DragonKill", EventTime: 350 }],
      allPlayers: [],
      activePlayer: null,
    };
    render(<InGameTimers />);
    // Last kill at 350s = 5:50. Next spawn at 350 + 300 = 650s. Now=400. ETA=4:10
    expect(screen.getByText(/último a 5:50/)).toBeInTheDocument();
    expect(screen.getByText(/Próximo: 4:10/)).toBeInTheDocument();
  });

  it("when objective is spawnable now, shows 'Spawn ahora' state", () => {
    mockState.snapshot = {
      gameData: { gameTime: 350, gameMode: "CLASSIC", mapNumber: 11 },
      events: [],
      allPlayers: [],
      activePlayer: null,
    };
    render(<InGameTimers />);
    // Drake first spawn at 300s, current 350s => ready
    expect(screen.getAllByText(/Spawn ahora/).length).toBeGreaterThan(0);
  });
});
