// Render-level integration test — closes the LAST seam the logic-only
// draftFlow.integration.test leaves open:
//
//   LCU session → applySession() → draftStore → React subscription
//     → key derivation → useSuggestions() → SuggestionPanel render
//
// The logic test stops at suggest(); this one mounts the REAL useSuggestions
// hook + the REAL SuggestionPanel and asserts the DOM, so a store-subscription
// / selector / re-render regression (the F1 class) can't slip through green
// unit tests. Uses a tiny harness that mirrors App's exact wiring.

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import { __testOnly_applySession as applySession } from "./lcuSync";
import { useDraftStore } from "./draftStore";
import { useSuggestions } from "../hooks/useSuggestions";
import { SuggestionPanel } from "../components/SuggestionPanel";
import type { Champion, ChampionDb, MetaTier, Role } from "../types/champion";

function champ(key: string, name: string, roles: Role[]): Champion {
  const id = name.replace(/\s/g, "");
  // Non-empty URLs so the panel's <img> doesn't warn about src="" under jsdom.
  return {
    id,
    key,
    name,
    title: "",
    iconUrl: `https://example.test/${id}.png`,
    splashUrl: `https://example.test/${id}_splash.jpg`,
    tags: [],
    roles,
    archetypes: [],
  };
}
function meta(championKey: string, role: Role, tier: MetaTier["tier"]): MetaTier {
  return { championKey, role, tier, winRate: 0.52, pickRate: 0.05, banRate: 0 };
}

const ZED = "238";
const YASUO = "157";
const ORIANNA = "61";
const ANNIE = "1";
const AATROX = "266";

const db: ChampionDb = {
  patch: "16.10",
  champions: {
    [ZED]: champ(ZED, "Zed", ["MIDDLE"]),
    [YASUO]: champ(YASUO, "Yasuo", ["MIDDLE"]),
    [ORIANNA]: champ(ORIANNA, "Orianna", ["MIDDLE"]),
    [ANNIE]: champ(ANNIE, "Annie", ["MIDDLE"]),
    [AATROX]: champ(AATROX, "Aatrox", ["TOP"]),
  },
  counters: [],
  meta: [meta(ORIANNA, "MIDDLE", "S"), meta(ANNIE, "MIDDLE", "A")],
  fetchedAt: Date.now(),
};

const player = (cellId: number, championId: number, opts: Record<string, unknown> = {}) => ({
  cellId,
  championId,
  championPickIntent: 0,
  assignedPosition: "",
  summonerId: 1000 + cellId,
  ...opts,
});

// Mirror of App's wiring: subscribe to the store, derive keys, run the real
// suggestion hook, render the real panel. The two data-testid regions let the
// assertions tell "rendered as an enemy pick" apart from "rendered as a
// suggestion" (the same champion name can't be both).
function DraftBoardHarness() {
  const ally = useDraftStore((s) => s.ally);
  const enemy = useDraftStore((s) => s.enemy);
  const bans = useDraftStore((s) => s.bans);
  const myRole = useDraftStore((s) => s.myRole);

  const allyKeys = ally.map((x) => x.championKey).filter((k): k is string => !!k);
  const enemyKeys = enemy.map((x) => x.championKey).filter((k): k is string => !!k);
  const bannedKeys = [...bans.ally, ...bans.enemy].filter((k): k is string => !!k);

  const suggestions = useSuggestions({
    db,
    role: myRole,
    allyKeys,
    enemyKeys,
    bannedKeys,
    personalStats: [],
    masteries: [],
    rankTier: null,
    usePersonalStats: false,
    useMastery: false,
    liveCounters: [],
  });

  return (
    <div>
      <ul data-testid="enemy">
        {enemy.map((s, i) =>
          s.championKey ? <li key={i}>{db.champions[s.championKey]?.name}</li> : null
        )}
      </ul>
      <div data-testid="suggestions">
        <SuggestionPanel
          suggestions={suggestions}
          hasRole={!!myRole}
          hasDraft={allyKeys.length > 0 || enemyKeys.length > 0}
        />
      </div>
    </div>
  );
}

describe("draft flow — LCU session reaches the rendered DOM", () => {
  beforeEach(() => useDraftStore.getState().reset());

  it("an applied session renders the enemy pick + suggestions, excluding taken champs", () => {
    render(<DraftBoardHarness />);

    act(() => {
      applySession({
        localPlayerCellId: 0,
        myTeam: [player(0, 0, { assignedPosition: "MIDDLE" })],
        theirTeam: [player(5, Number(ZED))],
        bans: { myTeamBans: [Number(YASUO)], theirTeamBans: [] },
      } as unknown as Parameters<typeof applySession>[0]);
    });

    // Enemy lock surfaced in the board region.
    expect(within(screen.getByTestId("enemy")).getByText("Zed")).toBeTruthy();

    // The suggestion panel rendered an available meta mid…
    const panel = within(screen.getByTestId("suggestions"));
    expect(panel.getByText("Orianna")).toBeTruthy();
    // …and never the picked or banned champs.
    expect(panel.queryByText("Zed")).toBeNull();
    expect(panel.queryByText("Yasuo")).toBeNull();
  });

  it("re-renders reactively when the session clears (leave wipes the board)", () => {
    render(<DraftBoardHarness />);

    act(() => {
      applySession({
        localPlayerCellId: 0,
        myTeam: [player(0, 0, { assignedPosition: "MIDDLE" })],
        theirTeam: [player(5, Number(ZED))],
        bans: { myTeamBans: [], theirTeamBans: [] },
      } as unknown as Parameters<typeof applySession>[0]);
    });
    expect(within(screen.getByTestId("enemy")).getByText("Zed")).toBeTruthy();

    // Leave → emptied session → board (and DOM) clears.
    act(() => {
      applySession({
        localPlayerCellId: -1,
        myTeam: [],
        theirTeam: [],
      } as unknown as Parameters<typeof applySession>[0]);
    });
    expect(within(screen.getByTestId("enemy")).queryByText("Zed")).toBeNull();
  });
});
