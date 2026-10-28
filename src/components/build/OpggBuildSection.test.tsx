// OpggBuildSection wires one op.gg payload into the whole build view. Pickers
// (pickBestBuild / highest-WR skill order / most-popular rune page), the
// archetype classifier, spell coherence and every child component run for
// real; only network-backed services and lazy icon manifests are mocked.
//   - Header: archetype name/desc, tier badge (core >= 500 games), games + WR
//   - Stat chips from the core items
//   - Build rows, buy-order timeline, live counters, comp adaptations
//   - Rune block (keystone, secondary tree, shards) + coherent spells
//   - Copy-to-clipboard text + success / error toasts
//   - Empty payload → generic header, jungle Smite fallback, no optional blocks

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { OpggBuildSection } from "./OpggBuildSection";
import { ToastProvider } from "../ui/ToastContainer";
import type { Champion, Role } from "../../types/champion";
import type { OpggBuild, OpggBuildPath, OpggRunes } from "../../services/opggBuilds";
import type { BuildAdaptation } from "../../engine/adaptiveBuildEngine";
import type { InGameSuggestion } from "../../engine/inGameAdapter";
import * as matchups from "../../services/opggMatchups";
import * as pro from "../../services/proBuilds";

vi.mock("../../services/opggMatchups", async (importActual) => {
  const actual = await importActual<typeof import("../../services/opggMatchups")>();
  return { ...actual, fetchOpggMatchups: vi.fn() };
});
vi.mock("../../services/proBuilds", () => ({ fetchProBuilds: vi.fn() }));
vi.mock("../../services/lolvvvBuilds", () => ({
  fetchLolvvvBuild: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../services/lcuService", () => ({
  applySummonerSpells: vi.fn(),
  applyRunes: vi.fn(),
}));
// Lazy DDragon / CommunityDragon manifests — keep the render offline.
vi.mock("../../services/itemMeta", () => ({
  getItemMeta: () => null,
  subscribeToItemMeta: () => () => {},
}));
vi.mock("../../services/perkIcons", () => ({
  getPerkIconUrl: (id: number) => `perk-${id}.png`,
  subscribeToPerkIcons: () => () => {},
}));
vi.mock("../../services/championSpells", () => ({
  getChampionSpells: () => null,
  subscribeToChampionSpells: () => () => {},
  spellIconUrl: (_p: string, img: string) => img,
}));

const PATCH = "16.21.1";

const JINX: Champion = {
  id: "Jinx",
  key: "222",
  name: "Jinx",
  title: "",
  iconUrl: "",
  splashUrl: "",
  tags: ["Marksman"],
  roles: ["BOTTOM"],
  archetypes: [],
};

const p = (ids: number[], play: number, win: number, pickRate: number): OpggBuildPath => ({
  ids,
  names: [],
  play,
  win,
  pickRate,
});

const RUNE_MAIN: OpggRunes = {
  primaryPage: "Precision",
  primaryRunes: ["Lethal Tempo", "Triumph", "Legend: Alacrity", "Coup de Grace"],
  secondaryPage: "Inspiration",
  secondaryRunes: ["Magical Footwear", "Biscuit Delivery"],
  statMods: ["5005", "5008", "5001"],
  play: 800,
  pickRate: 0.45,
};

const EMPTY: OpggBuild = {
  coreItems: [],
  boots: [],
  starterItems: [],
  fourthItems: [],
  fifthItems: [],
  sixthItems: [],
  runes: [],
  skills: [],
  strongCounters: [],
  weakCounters: [],
  summonerSpells: [],
};

const FULL: OpggBuild = {
  ...EMPTY,
  starterItems: [
    p([1055, 2003], 1000, 500, 0.6),
    p([1083], 200, 120, 0.1), // best WR among >= 3% pick rate → chosen
    p([1054], 10, 9, 0.01), // higher WR but below the sample threshold
  ],
  boots: [p([3006], 900, 470, 0.7)],
  // Dup + placeholder ids are dropped from the classified core.
  coreItems: [p([3031, 3094, 0, 3157, 3065, 3031], 1000, 560, 0.4)],
  fourthItems: [p([3046, 0], 400, 200, 0.3)],
  fifthItems: [p([3072], 300, 150, 0.3)],
  sixthItems: [p([3139], 100, 50, 0.3)],
  runes: [
    { ...RUNE_MAIN, primaryPage: "Domination", pickRate: 0.1 },
    RUNE_MAIN, // most popular → shown
  ],
  skills: [
    { order: "QWEQQRQWQWRWWEEREE", play: 1000, win: 500, pickRate: 0.6 },
    { order: "QEWQQRQEQERWWEERWW", play: 400, win: 220, pickRate: 0.3 }, // 55% → chosen
  ],
  summonerSpells: [{ ids: [4, 7], pickRate: 0.8, play: 1000, win: 530, winRate: 0.53 }],
};

const COPY_FULL = [
  "Crit DPS · Jinx BOTTOM",
  "Build escalado a late game. Stack crit + AS para DPS sostenido. Posiciona y kitea.",
  "Inicio: 1083",
  "Botas: 3006",
  "Core 3: 3031, 3094, 3157, 3065",
  "4º item: 3046",
  "Runas: Precision (Lethal Tempo, Triumph, Legend: Alacrity, Coup de Grace) / Inspiration (Magical Footwear, Biscuit Delivery)",
  "Habilidades: QEWQQRQEQERWWEERWW",
  "Patch 16.21.1",
].join("\n");

function renderSection(
  over: {
    build?: OpggBuild;
    role?: Role;
    adaptations?: BuildAdaptation[];
    inGameSuggestions?: InGameSuggestion[];
    enemyDdIds?: string[];
  } = {}
) {
  return render(
    <ToastProvider>
      <OpggBuildSection
        build={over.build ?? FULL}
        patch={PATCH}
        champion={JINX}
        role={over.role ?? "BOTTOM"}
        adaptations={over.adaptations ?? []}
        inGameSuggestions={over.inGameSuggestions ?? []}
        enemyDdIds={over.enemyDdIds}
      />
    </ToastProvider>
  );
}

function chip(label: string): string {
  return screen.getByText(label, { selector: "span.opacity-70" }).parentElement!.textContent!;
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(matchups.fetchOpggMatchups).mockResolvedValue([]);
  vi.mocked(pro.fetchProBuilds).mockResolvedValue(null);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  // Matchup grid's collapsible Panel remembers open/closed state — keep it per-test.
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("OpggBuildSection — full payload", () => {
  it("headlines the classified archetype with tier, games and WR", async () => {
    renderSection();
    const name = screen.getByText("Crit DPS");
    const header = name.parentElement as HTMLElement;
    expect(within(header).getByText("S+")).toBeInTheDocument();
    expect(within(header).getByText("op.gg")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Build escalado a late game. Stack crit + AS para DPS sostenido. Posiciona y kitea."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/1\.0k partidas/)).toBeInTheDocument();
    expect(screen.getByText("56.0% WR").className).toContain("text-good");
    await act(async () => {});
  });

  it("rolls the core items up into stat chips", async () => {
    renderSection();
    expect(chip("AD")).toBe("AD105");
    expect(chip("AP")).toBe("AP100");
    expect(chip("HP")).toBe("HP450");
    expect(chip("ARM")).toBe("ARM50");
    expect(chip("MR")).toBe("MR50");
    expect(chip("CRIT")).toBe("CRIT2");
    await act(async () => {});
  });

  it("renders every build-path row, the buy-order timeline and the best skill order", async () => {
    renderSection();
    for (const label of ["4º item", "5º item", "6º item"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Starter row shows the best-WR significant path (Doran's Shield id 1083).
    const starterRow = screen.getAllByText("Inicio")[0].parentElement as HTMLElement;
    expect(starterRow.querySelector("img")).toHaveAttribute(
      "src",
      `https://ddragon.leagueoflegends.com/cdn/${PATCH}/img/item/1083.png`
    );
    expect(screen.getByText("Orden de compra · timeline")).toBeInTheDocument();
    expect(screen.getByText("~40:00+")).toBeInTheDocument();

    expect(screen.getByText("Subida de habilidades")).toBeInTheDocument();
    // Highest-WR order (QEW...) wins over the more played QWE... one.
    expect(screen.getByTitle("Nivel 2: E")).toBeInTheDocument();
    expect(screen.getByTitle("Nivel 3: W")).toBeInTheDocument();
    await act(async () => {});
  });

  it("renders the most popular rune page with keystone, secondary tree and shards", async () => {
    renderSection();
    expect(screen.getByText("Runas recomendadas")).toBeInTheDocument();
    expect(screen.getByText("Precisión / Inspiración")).toBeInTheDocument();
    expect(screen.queryByText(/Dominación/)).toBeNull();
    expect(screen.getByText("Precisión")).toBeInTheDocument();
    expect(screen.getByText("Inspiración")).toBeInTheDocument();

    expect(screen.getByAltText("Lethal Tempo")).toHaveAttribute("src", "perk-8008.png");
    expect(screen.getByAltText("Lethal Tempo").className).toContain("w-12");
    expect(screen.getByAltText("Triumph").className).toContain("w-8");
    expect(screen.getByAltText("Biscuit Delivery")).toHaveAttribute("src", "perk-8345.png");

    expect(screen.getByText("Fragmentos")).toBeInTheDocument();
    expect(screen.getByAltText("5008")).toHaveAttribute("src", "perk-5008.png");
    expect(screen.getByAltText("5008").className).toContain("w-6");
    await act(async () => {});
  });

  it("keeps op.gg's spells when coherent and shows their pick/win rate", async () => {
    renderSection();
    expect(screen.getByText("Flash + Heal")).toBeInTheDocument();
    expect(screen.getByText("ADC estándar → Heal")).toBeInTheDocument();
    expect(screen.getByText("53% WR")).toBeInTheDocument();
    expect(screen.getByText("80% PR")).toBeInTheDocument();
    await act(async () => {});
  });

  it("lists live counters and comp adaptations with priority styling", async () => {
    renderSection({
      inGameSuggestions: [
        {
          itemId: 3033,
          itemName: "Mortal Reminder",
          reason: "3 enemigos curándose — Grievous Wounds AD",
          priority: "core",
          key: "gw-ad",
        },
        {
          itemId: 3036,
          itemName: "Lord Dominik's Regards",
          reason: "230 armadura media",
          priority: "situational",
          key: "armor-pen",
        },
      ],
      adaptations: [
        {
          itemId: 4644,
          itemName: "Force of Nature",
          reason: "Equipo enemigo 60% AP — necesitas MR",
          priority: "core",
        },
        {
          itemId: 3157,
          itemName: "Zhonya's Hourglass",
          reason: "Squishy contra AP",
          priority: "situational",
        },
      ],
    });

    expect(screen.getByText("🔴 Counters live · según items enemigos")).toBeInTheDocument();
    const mortal = screen.getByTitle("3 enemigos curándose — Grievous Wounds AD");
    expect(mortal).toHaveTextContent("Mortal Reminder");
    expect(mortal.className).toContain("bg-bad/10");
    expect(screen.getByTitle("230 armadura media").className).toContain("bg-meh/10");

    expect(screen.getByText("Adaptaciones vs comp enemiga")).toBeInTheDocument();
    const fon = screen.getByText("Force of Nature").closest("div.rounded") as HTMLElement;
    expect(fon).toHaveTextContent("Equipo enemigo 60% AP — necesitas MR");
    expect(fon.className).toContain("bg-bad/10");
    const zhonya = screen.getByText("Zhonya's Hourglass").closest("div.rounded") as HTMLElement;
    expect(zhonya).toHaveTextContent("Squishy contra AP");
    expect(zhonya.className).toContain("bg-meh/10");
    await act(async () => {});
  });

  it("forwards the numeric champion key to pro builds and enemies to the matchup grid", async () => {
    vi.mocked(matchups.fetchOpggMatchups).mockResolvedValue([
      { championKey: "draven", championName: "Draven", winRate: 46, play: 600, win: 276 },
      { championKey: "ezreal", championName: "Ezreal", winRate: 53, play: 600, win: 318 },
    ]);
    renderSection({ enemyDdIds: ["Draven"] });

    expect(await screen.findByText("Contra tu línea")).toBeInTheDocument();
    expect(pro.fetchProBuilds).toHaveBeenCalledWith(222, "BOTTOM");
    await act(async () => {});
  });
});

describe("OpggBuildSection — copy", () => {
  it("copies a compact text summary and confirms with a toast", async () => {
    renderSection();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Copia la build entera al portapapeles para Discord"));
    });
    expect(writeText).toHaveBeenCalledWith(COPY_FULL);
    expect(screen.getByRole("status")).toHaveTextContent("Build copiada");
  });

  it("shows an error toast when the clipboard is blocked", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderSection();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copiar/ }));
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo copiar");
    expect(alert).toHaveTextContent("El navegador bloqueó el acceso al portapapeles.");
  });

  it("copies only the fallback name and patch for an empty payload", async () => {
    renderSection({ build: EMPTY, role: "JUNGLE" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copiar/ }));
    });
    expect(writeText).toHaveBeenCalledWith("Build · Jinx JUNGLE\nPatch 16.21.1");
  });
});

describe("OpggBuildSection — sparse payloads", () => {
  it("falls back to a generic header and omits every optional block when empty", async () => {
    renderSection({ build: EMPTY, role: "JUNGLE" });

    expect(screen.getByText("Build óptima")).toBeInTheDocument();
    expect(screen.queryByText(/k partidas/)).toBeNull();
    expect(screen.queryByText("Orden de compra · timeline")).toBeNull();
    expect(screen.queryByText("Subida de habilidades")).toBeNull();
    expect(screen.queryByText("Runas recomendadas")).toBeNull();
    expect(screen.queryByText(/Counters live/)).toBeNull();
    expect(screen.queryByText("Adaptaciones vs comp enemiga")).toBeNull();

    // Spells still render: jungle coherence forces Flash + Smite.
    expect(screen.getByText("Flash + Smite")).toBeInTheDocument();
    expect(screen.getByText(/Jungla → Smite obligatorio/).textContent).toBe(
      "↳ Jungla → Smite obligatorio"
    );
    expect(screen.getByText("0% WR")).toBeInTheDocument();
    await act(async () => {});
  });

  it("drops the header tier under 500 games and only shows stats the core has", async () => {
    renderSection({
      build: {
        ...EMPTY,
        coreItems: [p([3089], 300, 150, 0.5)],
        runes: [{ ...RUNE_MAIN, primaryPage: "Domination", secondaryPage: "Sorcery", secondaryRunes: [], statMods: [] }],
        skills: [
          { order: "QWEQQRQWQWRWWEEREE", play: 0, win: 0, pickRate: 0.5 },
          { order: "EQWEERQEQERWWEERWW", play: 0, win: 0, pickRate: 0.5 },
        ],
      },
    });

    const name = screen.getByText("Build estándar");
    expect(within(name.parentElement as HTMLElement).queryByText(/^(S\+|S|A|B|C)$/)).toBeNull();
    expect(screen.getByText("Build óptima según el meta actual.")).toBeInTheDocument();
    expect(screen.getByText(/0\.3k partidas/)).toBeInTheDocument();
    expect(screen.getByText("50.0% WR").className).toContain("text-white/55");

    expect(chip("AP")).toBe("AP120");
    for (const label of ["AD", "HP", "ARM", "MR", "CRIT"]) {
      expect(screen.queryByText(label, { selector: "span.opacity-70" })).toBeNull();
    }

    // Rune page without secondary runes / shards: only the primary tree label.
    expect(screen.getByText("Dominación / Hechicería")).toBeInTheDocument();
    expect(screen.getByText("Dominación")).toBeInTheDocument();
    expect(screen.queryByText("Hechicería")).toBeNull();
    expect(screen.queryByText("Fragmentos")).toBeNull();

    // Zero-play skill variants tie at 0% → the first one is kept.
    expect(screen.getByTitle("Nivel 2: W")).toBeInTheDocument();
    await act(async () => {});
  });
});
