// SuggestionPanel contract:
//   - Empty list -> hint copy.
//   - No role and no draft -> "meta general" tag + pick-role prompt.
//   - Comfort picks (max 3) get their own section headed by a hero card; the
//     rest (max 3) go under "Meta puro". Without comfort picks the top 5 are
//     shown, the first as the hero, with no sub-header.
//   - Hero/row badges: perfect pick, comfort, one-trick crown, mastery chevron.
//   - Beginner mode adds counter/synergy/meta bars to the hero only; axes
//     without draft data render muted with "—".

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SuggestionPanel } from "./SuggestionPanel";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";
import type { ScoredSuggestion } from "../engine/suggestionEngine";

type Breakdown = ScoredSuggestion["breakdown"];

function sug(
  key: string,
  name: string,
  over: Partial<Omit<ScoredSuggestion, "breakdown">> & { breakdown?: Partial<Breakdown> } = {}
): ScoredSuggestion {
  const { breakdown, ...rest } = over;
  return {
    champion: {
      key,
      id: name,
      name,
      title: "",
      iconUrl: `https://cdn.test/${name}.png`,
      splashUrl: "",
      tags: [],
      roles: ["TOP"],
      archetypes: [],
    },
    score: 0.6,
    breakdown: {
      counter: 0.5,
      synergy: 0.5,
      meta: 0.5,
      archetype: 0.5,
      hasEnemyData: true,
      hasAllyData: true,
      isComfort: false,
      isPerfectPick: false,
      masteryLevel: 0,
      ...breakdown,
    },
    reasons: [],
    color: "good",
    ...rest,
  };
}

/** Root element of a hero card or a row, found from the champion's name. */
function cardOf(name: string): HTMLElement {
  const img = screen.getByRole("img", { name });
  return img.closest(".rounded-lg, .rounded-md.p-2") as HTMLElement;
}

beforeEach(() => {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, beginnerMode: false } });
});

describe("SuggestionPanel — layout", () => {
  it("shows the empty hint when there are no suggestions", () => {
    render(<SuggestionPanel suggestions={[]} hasRole />);
    expect(screen.getByText("Selecciona algún campeón para ver sugerencias.")).toBeInTheDocument();
    expect(screen.queryByText("Top picks")).toBeNull();
  });

  it("flags general-meta mode and prompts for a role when there is no context", () => {
    render(<SuggestionPanel suggestions={[sug("1", "Aatrox")]} />);
    expect(screen.getByText("· meta general")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Selecciona tu rol arriba para picks personalizados según tu pool y el draft."
      )
    ).toBeInTheDocument();
  });

  it("hides the general-meta tag once a role or a draft exists", () => {
    const { rerender } = render(<SuggestionPanel suggestions={[sug("1", "Aatrox")]} hasRole />);
    expect(screen.queryByText("· meta general")).toBeNull();
    rerender(<SuggestionPanel suggestions={[sug("1", "Aatrox")]} hasDraft />);
    expect(screen.queryByText("· meta general")).toBeNull();
    expect(screen.queryByText(/Selecciona tu rol arriba/)).toBeNull();
  });

  it("without comfort picks shows the top 5 with the first as the #1 hero and no sub-headers", () => {
    const names = ["A1", "A2", "A3", "A4", "A5", "A6"];
    render(
      <SuggestionPanel suggestions={names.map((n, i) => sug(String(i), n))} hasRole />
    );
    for (const n of names.slice(0, 5)) expect(screen.getByRole("img", { name: n })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "A6" })).toBeNull();
    // Exactly one hero card, and it's the first suggestion.
    expect(screen.getAllByText("#1")).toHaveLength(1);
    expect(within(cardOf("A1")).getByText("#1")).toBeInTheDocument();
    expect(screen.queryByText("Meta puro")).toBeNull();
    expect(screen.queryByText("Tus picks · comfort + meta")).toBeNull();
  });

  it("splits comfort picks (max 3) from meta picks (max 3) with the first comfort as hero", () => {
    const list = [
      sug("1", "Meta1"),
      sug("2", "Comfy1", { breakdown: { isComfort: true } }),
      sug("3", "Meta2"),
      sug("4", "Comfy2", { breakdown: { isComfort: true } }),
      sug("5", "Comfy3", { breakdown: { isComfort: true } }),
      sug("6", "Comfy4", { breakdown: { isComfort: true } }),
      sug("7", "Meta3"),
      sug("8", "Meta4"),
    ];
    render(<SuggestionPanel suggestions={list} hasRole />);

    expect(screen.getByText("Tus picks · comfort + meta")).toBeInTheDocument();
    expect(screen.getByText("Meta puro")).toBeInTheDocument();
    expect(within(cardOf("Comfy1")).getByText("#1")).toBeInTheDocument();
    for (const n of ["Comfy1", "Comfy2", "Comfy3"]) {
      expect(screen.getByRole("img", { name: n })).toBeInTheDocument();
    }
    // 4th comfort pick is not a comfort slot; it competes in the meta bucket,
    // which takes the first 3 non-comfort-slot entries in order.
    for (const n of ["Meta1", "Meta2", "Comfy4"]) {
      expect(screen.getByRole("img", { name: n })).toBeInTheDocument();
    }
    expect(screen.queryByRole("img", { name: "Meta3" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Meta4" })).toBeNull();
  });
});

describe("SuggestionPanel — hero card", () => {
  it("joins the first two translated reasons", () => {
    render(
      <SuggestionPanel
        suggestions={[
          sug("1", "Aatrox", {
            reasons: ["suggestions.reason.counters", "suggestions.reason.synergy", "suggestions.reason.strongMeta"],
          }),
        ]}
        hasRole
      />
    );
    expect(screen.getByText("contrarresta a enemigos · sinergia con tu equipo")).toBeInTheDocument();
    expect(screen.queryByText(/fuerte en el meta/)).toBeNull();
  });

  it("falls back to 'pick sólido' when there are no reasons", () => {
    render(<SuggestionPanel suggestions={[sug("1", "Aatrox")]} hasRole />);
    expect(screen.getByText("pick sólido")).toBeInTheDocument();
    const hero = cardOf("Aatrox");
    expect(hero.className).toContain("ring-good/60");
    expect(hero.className).not.toContain("glowPulse");
    expect(within(hero).queryByText("Comfort")).toBeNull();
  });

  it("shows the perfect-pick badge with an accent ring", () => {
    render(
      <SuggestionPanel
        suggestions={[sug("1", "Aatrox", { breakdown: { isComfort: true, isPerfectPick: true } })]}
        hasRole
      />
    );
    const hero = cardOf("Aatrox");
    expect(within(hero).getByText("Pick perfecto")).toBeInTheDocument();
    expect(within(hero).queryByText("Comfort")).toBeNull();
    expect(hero.className).toContain("ring-accent");
    expect(hero.className).toContain("glowPulse");
  });

  it("shows the comfort badge for a non-perfect comfort pick", () => {
    render(
      <SuggestionPanel
        suggestions={[sug("1", "Aatrox", { color: "meh", breakdown: { isComfort: true } })]}
        hasRole
      />
    );
    const hero = cardOf("Aatrox");
    expect(within(hero).getByText("Comfort")).toBeInTheDocument();
    expect(hero.className).toContain("ring-meh/60");
    expect(hero.className).not.toContain("glowPulse");
  });

  it("marks a one-trick main with a crown instead of the comfort badge", () => {
    render(
      <SuggestionPanel
        suggestions={[
          sug("1", "Aatrox", {
            color: "bad",
            reasons: ["suggestions.reason.main"],
            breakdown: { isComfort: true },
          }),
        ]}
        hasRole
      />
    );
    const hero = cardOf("Aatrox");
    expect(within(hero).queryByText("Comfort")).toBeNull();
    expect(hero.querySelector(".lucide-crown")).not.toBeNull();
    expect(hero.className).toContain("ring-bad/60");
    expect(hero.className).toContain("glowPulse");
    expect(within(hero).getByText("tu main")).toBeInTheDocument();
  });

  it("shows the grade badge for the score", () => {
    render(<SuggestionPanel suggestions={[sug("1", "Aatrox", { score: 0.8 })]} hasRole />);
    expect(within(cardOf("Aatrox")).getByText("S+")).toBeInTheDocument();
  });
});

describe("SuggestionPanel — rows", () => {
  it("shows the first translated reason, or 'pick decente' without reasons", () => {
    render(
      <SuggestionPanel
        suggestions={[
          sug("1", "Hero"),
          sug("2", "WithReason", {
            reasons: ["suggestions.reason.fillsGap", "suggestions.reason.counters"],
          }),
          sug("3", "NoReason"),
        ]}
        hasRole
      />
    );
    expect(within(cardOf("WithReason")).getByText("aporta lo que falta")).toBeInTheDocument();
    expect(within(cardOf("WithReason")).queryByText(/contrarresta/)).toBeNull();
    expect(within(cardOf("NoReason")).getByText("pick decente")).toBeInTheDocument();
  });

  it("puts the axis percentages in the row tooltip", () => {
    render(
      <SuggestionPanel
        suggestions={[
          sug("1", "Hero"),
          sug("2", "Row", { breakdown: { counter: 0.634, synergy: 0.4, meta: 0.915 } }),
        ]}
        hasRole
      />
    );
    expect(cardOf("Row")).toHaveAttribute("title", "Counter 63% · Synergy 40% · Meta 92%");
  });

  it("tags comfort rows and stars perfect rows", () => {
    render(
      <SuggestionPanel
        suggestions={[
          sug("1", "Hero", { breakdown: { isComfort: true } }),
          sug("2", "ComfyRow", { color: "bad", breakdown: { isComfort: true } }),
          sug("3", "PerfectRow", { breakdown: { isComfort: true, isPerfectPick: true } }),
        ]}
        hasRole
      />
    );
    const comfy = cardOf("ComfyRow");
    expect(within(comfy).getByText("comfort")).toBeInTheDocument();
    expect(comfy.className).toContain("ring-bad/40");
    const perfect = cardOf("PerfectRow");
    expect(within(perfect).queryByText("comfort")).toBeNull();
    expect(perfect.querySelector(".lucide-star")).not.toBeNull();
    expect(perfect.className).toContain("ring-accent/60");
  });
});

describe("SuggestionPanel — mastery chevron", () => {
  it.each([
    [10, "bg-red-500"],
    [7, "bg-accent"],
    [6, "bg-purple-500"],
    [5, "bg-blue-500"],
    [4, "bg-white/30"],
    [3, "bg-white/30"],
  ])("renders M%i with its tier color", (level, cls) => {
    render(
      <SuggestionPanel
        suggestions={[sug("1", "Hero"), sug("2", "Row", { breakdown: { masteryLevel: level } })]}
        hasRole
      />
    );
    const chevron = within(cardOf("Row")).getByTitle(`Mastery ${level}`);
    expect(chevron).toHaveTextContent(String(level));
    expect(chevron.className).toContain(cls);
    expect(chevron.className).toContain("w-4 h-4");
  });

  it("hides the chevron below M3 and uses the large size on the hero", () => {
    render(
      <SuggestionPanel
        suggestions={[
          sug("1", "Hero", { breakdown: { masteryLevel: 7 } }),
          sug("2", "Row", { breakdown: { masteryLevel: 2 } }),
        ]}
        hasRole
      />
    );
    expect(within(cardOf("Hero")).getByTitle("Mastery 7").className).toContain("w-5 h-5");
    expect(within(cardOf("Row")).queryByTitle(/Mastery/)).toBeNull();
  });
});

describe("SuggestionPanel — beginner breakdown bars", () => {
  it("renders the three axis values on the hero only", () => {
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, beginnerMode: true } });
    render(
      <SuggestionPanel
        suggestions={[
          sug("1", "Hero", { breakdown: { counter: 0.72, synergy: 0.31, meta: 1.2 } }),
          sug("2", "Row"),
        ]}
        hasRole
      />
    );
    const hero = cardOf("Hero");
    const counter = within(hero).getByTitle("Counter (cómo contraataca a los enemigos)");
    expect(counter).toHaveTextContent("72");
    expect(within(hero).getByTitle("Sinergia (encaje con tu equipo)")).toHaveTextContent("31");
    const meta = within(hero).getByTitle("Meta (tier del parche)");
    expect(meta).toHaveTextContent("120");
    // Bar fill is capped at 100%.
    expect((meta.querySelector("[style]") as HTMLElement).style.width).toBe("100%");
    // Rows pass compact -> no bars.
    expect(within(cardOf("Row")).queryByTitle(/Counter \(/)).toBeNull();
  });

  it("mutes axes without draft data and shows a dash", () => {
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, beginnerMode: true } });
    render(
      <SuggestionPanel
        suggestions={[
          sug("1", "Hero", { breakdown: { hasEnemyData: false, hasAllyData: false, meta: 0.4 } }),
        ]}
        hasRole
      />
    );
    const hero = cardOf("Hero");
    const counter = within(hero).getByTitle(
      "Counter (cómo contraataca a los enemigos) — Sin enemigos en el draft"
    );
    expect(counter).toHaveTextContent("—");
    expect(counter.className).toContain("opacity-40");
    expect(counter.querySelector("[style]")).toBeNull();
    expect(
      within(hero).getByTitle("Sinergia (encaje con tu equipo) — Sin aliados en el draft")
    ).toHaveTextContent("—");
    expect(within(hero).getByTitle("Meta (tier del parche)")).toHaveTextContent("40");
  });

  it("renders no bars when beginner mode is off", () => {
    render(<SuggestionPanel suggestions={[sug("1", "Hero")]} hasRole />);
    expect(screen.queryByTitle("Meta (tier del parche)")).toBeNull();
  });
});
