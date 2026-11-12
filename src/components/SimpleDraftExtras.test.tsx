// Extra blocks of the simple champ-select screen: top strip, prepare rows
// (runes/spells/skills + apply) and the plain game plan.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { maxOrderOf, SimpleGamePlan, SimplePrepare, SimpleTopStrip } from "./SimpleDraftExtras";
import type { Champion, ChampionDb } from "../types/champion";
import { pickAutoRunePage, pickAutoSpells } from "../state/autoActions";
import { applyRunesResult, applySummonerSpells } from "../services/lcuService";
import { fetchOpggBuild } from "../services/opggBuilds";
import { deriveWinConditions } from "../engine/winConditions";

vi.mock("../state/autoActions", () => ({ pickAutoRunePage: vi.fn(), pickAutoSpells: vi.fn() }));
vi.mock("../services/lcuService", () => ({ applyRunesResult: vi.fn(), applySummonerSpells: vi.fn() }));
vi.mock("../services/opggBuilds", () => ({
  fetchOpggBuild: vi.fn(),
  SUMMONER_SPELL_META: { 4: { name: "Flash", icon: "f.png" }, 14: { name: "Ignite", icon: "i.png" } },
}));
vi.mock("../engine/winConditions", async (actual) => ({
  ...(await actual<typeof import("../engine/winConditions")>()),
  deriveWinConditions: vi.fn(() => []),
}));
vi.mock("./build/icons", () => ({
  PerkIcon: ({ id }: { id: number }) => <span>{`perk-${id}`}</span>,
  SpellIcon: ({ id }: { id: number }) => <span>{`spell-${id}`}</span>,
}));

const champ = (key: string, id: string, archetypes: string[] = []) =>
  ({ key, id, name: id, iconUrl: `icon/${id}.png`, tags: [], roles: [], archetypes }) as unknown as Champion;
const db = {
  patch: "16.1.1",
  meta: [],
  counters: [],
  champions: {
    "103": champ("103", "Ahri", ["burst"]),
    "238": champ("238", "Zed", ["burst"]),
    "54": champ("54", "Malphite", ["engage", "frontline"]),
  },
} as unknown as ChampionDb;

beforeEach(() => {
  vi.mocked(pickAutoRunePage).mockReset().mockResolvedValue(null);
  vi.mocked(pickAutoSpells).mockReset().mockResolvedValue([4, 14]);
  vi.mocked(fetchOpggBuild).mockReset().mockResolvedValue(null);
  vi.mocked(applyRunesResult).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(applySummonerSpells).mockReset().mockResolvedValue(true);
});

describe("maxOrderOf", () => {
  it("orders skills by when they reach rank 5", () => {
    expect(maxOrderOf("QEWQQRQQEERWWEWWRE")).toEqual(["Q", "W", "E"]);
  });
  it("still lists all three when the order is short", () => {
    expect(maxOrderOf("QWE")).toHaveLength(3);
  });
});

describe("SimpleTopStrip", () => {
  it("shows the win chance with a plain reason", () => {
    render(
      <SimpleTopStrip
        db={db}
        prediction={{ winrate: 0.55, reasons: ["Tienes mejor meta tier"] }}
        allyKeys={[]}
        enemyKeys={[]}
        bannedKeys={[]}
        enemyMains={[]}
      />
    );
    expect(screen.getByText("55 de cada 100")).toBeInTheDocument();
    expect(screen.getByText("Vuestros campeones están más fuertes ahora mismo")).toBeInTheDocument();
  });

  it("names what the team lacks and warns about an enemy main still in play", () => {
    render(
      <SimpleTopStrip
        db={db}
        prediction={null}
        allyKeys={["103", "238"]}
        enemyKeys={[]}
        bannedKeys={[]}
        enemyMains={[{ championId: 54, points: 420_000, summonerName: "Rival" }]}
      />
    );
    expect(screen.getByText("A tu equipo le falta alguien que empiece las peleas")).toBeInTheDocument();
    expect(screen.getByText("Ojo: su Malphite lo juega muchísimo")).toBeInTheDocument();
    expect(screen.getByText("Rival tiene más de 420 mil puntos con él")).toBeInTheDocument();
  });

  it("drops a banned main and renders nothing when there's nothing to say", () => {
    const { container } = render(
      <SimpleTopStrip
        db={db}
        prediction={null}
        allyKeys={[]}
        enemyKeys={[]}
        bannedKeys={["54"]}
        enemyMains={[{ championId: 54, points: 420_000 }]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SimplePrepare", () => {
  it("shows runes, spells and skill order, and the button puts them in the game", async () => {
    const page = { name: "Ahri MIDDLE", primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8143, 8138, 8105, 8226, 8237, 5008, 5008, 5001] };
    vi.mocked(pickAutoRunePage).mockResolvedValue(page);
    vi.mocked(fetchOpggBuild).mockResolvedValue({
      skills: [{ order: "QEWQQRQQEERWWEWWRE", play: 10, win: 6, pickRate: 0.5 }],
    } as never);
    render(<SimplePrepare db={db} champion={db.champions["103"]} role="MIDDLE" />);
    expect(await screen.findByText("perk-8112")).toBeInTheDocument();
    expect(screen.getByText("Destello y Prender")).toBeInTheDocument();
    expect(screen.getByText("Primero la Q, luego la W")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Poner en el juego" }));
    await waitFor(() => expect(screen.getByText("✓ Runas y hechizos puestos")).toBeInTheDocument());
    expect(applyRunesResult).toHaveBeenCalledWith(page);
    expect(applySummonerSpells).toHaveBeenCalledWith(4, 14);
  });

  it("says so when the client refuses", async () => {
    vi.mocked(applySummonerSpells).mockResolvedValue(false);
    render(<SimplePrepare db={db} champion={db.champions["103"]} role="MIDDLE" />);
    fireEvent.click(await screen.findByRole("button", { name: "Poner en el juego" }));
    expect(await screen.findByText("No se pudo. ¿Estás en la selección de campeón?")).toBeInTheDocument();
  });
});

describe("SimpleGamePlan", () => {
  it("uses the plain twin of the top two win conditions", () => {
    vi.mocked(deriveWinConditions).mockReturnValue([
      { key: "winConditions.rules.enemyScalingLate", phase: "early", priority: 1 },
      { key: "winConditions.rules.roleMidDefault", phase: "mid", priority: 2 },
      { key: "winConditions.rules.defaultMixed", phase: "any", priority: 3 },
    ]);
    render(<SimpleGamePlan db={db} myChampionKey="103" myRole="MIDDLE" allyKeys={["103"]} enemyKeys={["238"]} />);
    expect(screen.getByText("Ellos son más fuertes al final. Forzad dragones y peleas antes del minuto 25.")).toBeInTheDocument();
    expect(screen.queryByText(/Equipos parejos/)).not.toBeInTheDocument();
  });
});
