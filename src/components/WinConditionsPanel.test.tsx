// WinConditionsPanel contract:
//   - Hidden until at least one non-empty ally or enemy key exists.
//   - Feeds the draft to deriveWinConditions and renders each condition's
//     translated text, phase label + priority, phase icon and tooltip;
//     priority 1 is emphasised.
// deriveWinConditions is a spy over the real engine; tests that pin the
// rendering override its return value.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChampionDb } from "../types/champion";
import type { WinCondition } from "../engine/winConditions";

vi.mock("../engine/winConditions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/winConditions")>();
  return { ...actual, deriveWinConditions: vi.fn(actual.deriveWinConditions) };
});

import { WinConditionsPanel } from "./WinConditionsPanel";
import { deriveWinConditions } from "../engine/winConditions";

const realDerive = (
  await vi.importActual<typeof import("../engine/winConditions")>("../engine/winConditions")
).deriveWinConditions;

const db = {
  patch: "16.1.1",
  champions: {},
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

beforeEach(() => {
  vi.mocked(deriveWinConditions).mockImplementation(realDerive);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function itemOf(text: string | RegExp): HTMLElement {
  return screen.getByText(text).closest("li") as HTMLElement;
}

describe("WinConditionsPanel", () => {
  it("renders nothing while both teams are empty", () => {
    const { container } = render(
      <WinConditionsPanel db={db} myChampionKey={null} myRole={null} allyKeys={["", ""]} enemyKeys={[""]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("passes the draft to the engine", () => {
    const allyKeys = ["1"];
    const enemyKeys = ["2", "3"];
    render(
      <WinConditionsPanel db={db} myChampionKey="1" myRole="MIDDLE" allyKeys={allyKeys} enemyKeys={enemyKeys} />
    );
    expect(deriveWinConditions).toHaveBeenCalledWith({
      db,
      myChampionKey: "1",
      myRole: "MIDDLE",
      allyKeys,
      enemyKeys,
    });
    expect(screen.getByText("Game plan")).toBeInTheDocument();
  });

  it("renders each condition with phase, priority, icon and tooltip", () => {
    const conds: WinCondition[] = [
      { key: "winConditions.rules.myHypercarry", params: { name: "Jinx" }, phase: "late", priority: 1 },
      { key: "winConditions.rules.enemyScalingLate", phase: "early", priority: 2 },
      { key: "winConditions.rules.roleMidDefault", phase: "mid", priority: 3 },
      { key: "winConditions.rules.defaultMixed", phase: "any", priority: 2 },
    ];
    vi.mocked(deriveWinConditions).mockReturnValue(conds);
    render(
      <WinConditionsPanel db={db} myChampionKey={null} myRole={null} allyKeys={[]} enemyKeys={["9"]} />
    );

    const hyper = itemOf(
      "Jinx es hypercarry. Tu equipo debe peelearte. Pídeles peel y mantente atrás en teamfights."
    );
    expect(hyper).toHaveTextContent("Late · #1");
    expect(hyper).toHaveAttribute("title", "Fase Late · prioridad 1");
    expect(hyper.className).toContain("bg-accent/10");
    expect(hyper.querySelector("p")!.className).toContain("font-medium");
    expect(hyper.querySelector(".lucide-hourglass")).not.toBeNull();

    const early = itemOf(/Eres más fuerte ahora/);
    expect(early).toHaveTextContent("Early · #2");
    expect(early).toHaveAttribute("title", "Fase Early · prioridad 2");
    expect(early.className).not.toContain("bg-accent/10");
    expect(early.querySelector("p")!.className).not.toContain("font-medium");
    expect(early.querySelector(".lucide-flame")).not.toBeNull();

    const mid = itemOf(/Mid: tras shovear/);
    expect(mid).toHaveTextContent("Mid · #3");
    expect(mid.querySelector(".lucide-target")).not.toBeNull();

    const any = itemOf(/Comp equilibrada/);
    expect(any).toHaveTextContent("Any · #2");
    expect(any.querySelector(".lucide-sparkles")).not.toBeNull();

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("shows the panel with only ally picks", () => {
    vi.mocked(deriveWinConditions).mockReturnValue([
      { key: "winConditions.rules.allyEngageHard", phase: "mid", priority: 1 },
    ]);
    render(
      <WinConditionsPanel db={db} myChampionKey={null} myRole={null} allyKeys={["5"]} enemyKeys={[""]} />
    );
    expect(screen.getByText(/Tu equipo tiene engage hard/)).toBeInTheDocument();
  });
});
