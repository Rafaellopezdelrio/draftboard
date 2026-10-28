// ChampionGuideView contract (stripHtml has its own XSS suite in
// ChampionGuideView.stripHtml.test.ts):
//   - Unknown champion renders nothing and fetches nothing.
//   - Header: splash/icon/name/title + up to 3 meta tier badges for this champ.
//   - Role selector starts on the champion's first role, only available roles
//     are selectable, and the selection feeds the Build and AI tabs.
//   - Overview / Abilities render from the Data Dragon detail; Tips merges the
//     curated matchup DB; AI tab loads a cached guide or generates one with
//     the provider-specific key and renders the markdown subset.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { ChampionGuideView } from "./ChampionGuideView";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";
import type { ChampionDb, MetaTier } from "../types/champion";
import type { ChampionDetail } from "../services/dataDragon";

vi.mock("../services/dataDragon", () => ({
  fetchChampionDetail: vi.fn(),
}));

vi.mock("../services/aiChampionGuide", () => ({
  getCachedGuide: vi.fn(),
  generateChampionGuide: vi.fn(),
}));

// BuildPanel pulls live-game hooks, SQLite aggregates and op.gg fetches;
// a stub that echoes its props is enough to observe what the guide passes.
vi.mock("./BuildPanel", async () => {
  const { createElement } = await import("react");
  return {
    BuildPanel: (p: { championKey: string; role: string; enemyKeys?: string[] }) =>
      createElement(
        "div",
        { "data-testid": "build-panel" },
        `${p.championKey}|${p.role}|${p.enemyKeys?.length ?? "none"}`
      ),
  };
});

import { fetchChampionDetail } from "../services/dataDragon";
import { getCachedGuide, generateChampionGuide } from "../services/aiChampionGuide";

function champ(key: string, id: string, name: string, roles: string[], tags: string[] = []) {
  return {
    key,
    id,
    name,
    title: `title of ${name}`,
    iconUrl: `https://cdn.test/icon/${id}.png`,
    splashUrl: `https://cdn.test/splash/${id}.jpg`,
    roles,
    tags,
  };
}

function meta(championKey: string, role: MetaTier["role"], tier: MetaTier["tier"]): MetaTier {
  return { championKey, role, tier, winRate: 0.5, pickRate: 0.1, banRate: 0.05 };
}

const db = {
  patch: "16.10.1",
  champions: {
    "266": champ("266", "Aatrox", "Aatrox", ["TOP", "JUNGLE"], ["Fighter", "Tank"]),
    "21": champ("21", "MissFortune", "Miss Fortune", ["BOTTOM"], ["Marksman"]),
    "99": champ("99", "Lux", "Lux", []),
  },
  counters: [],
  meta: [
    // Another champion's entry first, so the header must filter by key
    // rather than just taking the first 3 rows.
    meta("21", "BOTTOM", "S+"),
    meta("266", "TOP", "S"),
    meta("266", "JUNGLE", "B"),
    meta("266", "MIDDLE", "C"),
    meta("266", "UTILITY", "D"), // 4th entry — header caps at 3
  ],
  fetchedAt: 0,
} as unknown as ChampionDb;

const DETAIL = {
  id: "Aatrox",
  name: "Aatrox",
  title: "la Espada de los Oscuros",
  lore: "Antaño fue un honorable defensor de Shurima.",
  tags: ["Fighter", "Tank"],
  passive: {
    name: "Postura del Arcángel",
    description: "Su próximo ataque <b>cura</b>.",
    image: { full: "Aatrox_Passive.png" },
  },
  spells: [
    {
      id: "AatroxQ",
      name: "Espada Oscura",
      description: 'Golpea<script>alert(1)</script> con <font color="#ff0000" onclick="x()">fuerza</font>.',
      cooldown: [14, 12, 10],
      cost: [0, 0, 0],
      range: [625, 625, 625],
      image: { full: "AatroxQ.png" },
    },
    {
      id: "AatroxW",
      name: "Cadenas Infernales",
      description: "Atrae al enemigo.",
      cooldown: [20, 18],
      cost: [30, 35],
      range: [0, 0],
      image: { full: "AatroxW.png" },
    },
    {
      id: "AatroxE",
      name: "Impulso Sombrío",
      description: "Se desplaza.",
      cooldown: [],
      cost: [],
      range: [],
      image: { full: "AatroxE.png" },
    },
    {
      id: "AatroxR",
      name: "Aniquilador de Mundos",
      description: "Se transforma.",
      cooldown: [120, 100, 80],
      cost: [0],
      range: [0],
      image: { full: "AatroxR.png" },
    },
  ],
  info: { attack: 8, defense: 4, magic: 3, difficulty: 4 },
} as unknown as ChampionDetail;

function setPrefs(over: Partial<typeof DEFAULT_PREFS>) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

async function renderGuide(championKey = "266", onClose = vi.fn()) {
  const utils = render(<ChampionGuideView db={db} championKey={championKey} onClose={onClose} />);
  // Flush the fetchChampionDetail promise + loading=false.
  await act(async () => {});
  return { ...utils, onClose };
}

function openTab(label: string) {
  fireEvent.click(screen.getByRole("tab", { name: label }));
}

function roleButton(role: string) {
  return screen.getByRole("button", { name: role });
}

beforeEach(() => {
  vi.clearAllMocks();
  setPrefs({});
  vi.mocked(fetchChampionDetail).mockResolvedValue(DETAIL);
  vi.mocked(getCachedGuide).mockResolvedValue(null);
});

describe("ChampionGuideView — shell", () => {
  it("renders nothing and fetches nothing for an unknown champion", () => {
    const { container } = render(
      <ChampionGuideView db={db} championKey="nope" onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
    expect(fetchChampionDetail).not.toHaveBeenCalled();
  });

  it("shows the loading text until the Data Dragon detail resolves", async () => {
    let resolve!: (d: ChampionDetail) => void;
    vi.mocked(fetchChampionDetail).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ChampionGuideView db={db} championKey="21" onClose={vi.fn()} />);
    expect(screen.getByText("Cargando guía...")).toBeInTheDocument();
    // Detail is fetched by DDragon id (not numeric key nor display name).
    expect(fetchChampionDetail).toHaveBeenCalledWith("16.10.1", "MissFortune");
    await act(async () => resolve(DETAIL));
    expect(screen.queryByText("Cargando guía...")).not.toBeInTheDocument();
    expect(screen.getByText("Stats Riot")).toBeInTheDocument();
  });

  it("renders the hero header with at most 3 of this champion's meta tiers", async () => {
    await renderGuide();
    expect(screen.getByRole("dialog", { name: "Aatrox" })).toBeInTheDocument();
    expect(screen.getByText("title of Aatrox")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aatrox" })).toHaveAttribute(
      "src",
      "https://cdn.test/icon/Aatrox.png"
    );
    const badges = screen.getAllByTitle(/^Tier /).map((b) => b.textContent);
    expect(badges).toEqual(["S", "B", "C"]);
  });

  it("closes on Escape and backdrop click, not on clicks inside the modal", async () => {
    const { onClose } = await renderGuide();
    fireEvent.click(screen.getByText("title of Aatrox"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ChampionGuideView — role selector", () => {
  it("starts on the first role, only enables available roles and feeds the Build tab", async () => {
    await renderGuide();
    expect(roleButton("TOP")).toHaveClass("bg-accent/20");
    expect(roleButton("JUNGLE")).toBeEnabled();
    expect(roleButton("MIDDLE")).toBeDisabled();
    expect(roleButton("MIDDLE")).toHaveClass("line-through");

    openTab("Build & runas");
    expect(screen.getByTestId("build-panel")).toHaveTextContent("266|TOP|0");

    fireEvent.click(roleButton("JUNGLE"));
    expect(roleButton("JUNGLE")).toHaveClass("bg-accent/20");
    expect(roleButton("TOP")).not.toHaveClass("bg-accent/20");
    expect(screen.getByTestId("build-panel")).toHaveTextContent("266|JUNGLE|0");

    fireEvent.click(roleButton("MIDDLE"));
    expect(screen.getByTestId("build-panel")).toHaveTextContent("266|JUNGLE|0");
  });

  it("defaults to MIDDLE for a champion without listed roles", async () => {
    await renderGuide("99");
    // Every role button is disabled, yet MIDDLE is the active selection.
    expect(roleButton("MIDDLE")).toBeDisabled();
    expect(roleButton("MIDDLE")).toHaveClass("bg-accent/20");
    openTab("Build & runas");
    expect(screen.getByTestId("build-panel")).toHaveTextContent("99|MIDDLE|0");
  });
});

describe("ChampionGuideView — overview & abilities", () => {
  it("overview shows db tags, 0-10 Riot stats as bars, and the lore", async () => {
    await renderGuide();
    expect(screen.getByText("Fighter")).toBeInTheDocument();
    expect(screen.getByText("Tank")).toBeInTheDocument();
    const attack = screen.getByText("Ataque").parentElement!;
    expect(within(attack).getByText("8/10")).toBeInTheDocument();
    const attackBar = attack.nextElementSibling!.firstElementChild as HTMLElement;
    expect(attackBar.style.width).toBe("80%");
    expect(attackBar).toHaveClass("bg-bad");
    expect(within(screen.getByText("Defensa").parentElement!).getByText("4/10")).toBeInTheDocument();
    expect(within(screen.getByText("Magia").parentElement!).getByText("3/10")).toBeInTheDocument();
    expect(within(screen.getByText("Dificultad").parentElement!).getByText("4/10")).toBeInTheDocument();
    expect(screen.getByText("Lore")).toBeInTheDocument();
    expect(screen.getByText("Antaño fue un honorable defensor de Shurima.")).toBeInTheDocument();
  });

  it("omits the lore panel when the detail has no lore", async () => {
    vi.mocked(fetchChampionDetail).mockResolvedValue({ ...DETAIL, lore: "" });
    await renderGuide();
    expect(screen.getByText("Stats Riot")).toBeInTheDocument();
    expect(screen.queryByText("Lore")).not.toBeInTheDocument();
  });

  it("renders no overview/abilities body when the detail could not be fetched", async () => {
    vi.mocked(fetchChampionDetail).mockResolvedValue(null);
    await renderGuide();
    expect(screen.queryByText("Cargando guía...")).not.toBeInTheDocument();
    expect(screen.queryByText("Stats Riot")).not.toBeInTheDocument();
    openTab("Habilidades");
    expect(screen.queryByText("Espada Oscura")).not.toBeInTheDocument();
  });

  it("abilities tab lists P/Q/W/E/R with icons, sanitized text and per-spell stats", async () => {
    await renderGuide();
    openTab("Habilidades");

    for (const k of ["P", "Q", "W", "E", "R"]) {
      expect(screen.getByText(k)).toBeInTheDocument();
    }

    const passiveImg = screen.getByRole("img", { name: "Postura del Arcángel" });
    expect(passiveImg).toHaveAttribute(
      "src",
      "https://ddragon.leagueoflegends.com/cdn/16.10.1/img/passive/Aatrox_Passive.png"
    );
    const qImg = screen.getByRole("img", { name: "Espada Oscura" }) as HTMLImageElement;
    expect(qImg).toHaveAttribute(
      "src",
      "https://ddragon.leagueoflegends.com/cdn/16.10.1/img/spell/AatroxQ.png"
    );
    fireEvent.error(qImg);
    expect(qImg.style.opacity).toBe("0.3");

    // Passive: formatting kept, no cooldown row.
    const passive = screen.getByText("Postura del Arcángel", { selector: "p" }).parentElement!;
    expect(passive.querySelector("b")).toHaveTextContent("cura");
    expect(within(passive).queryByText("CD:", { exact: false })).not.toBeInTheDocument();

    // Q: script stripped, colour kept, handler dropped; free cost hidden.
    const q = screen.getByText("Espada Oscura", { selector: "p" }).parentElement!;
    const qDesc = q.querySelector("p:nth-of-type(2)")!;
    expect(qDesc.innerHTML).not.toMatch(/script|alert|onclick/);
    expect(qDesc.innerHTML).toContain('<font color="#ff0000">fuerza</font>');
    expect(within(q).getByText("14/12/10s")).toBeInTheDocument();
    expect(within(q).getByText("625")).toBeInTheDocument();
    expect(within(q).queryByText(/Coste:/)).not.toBeInTheDocument();

    // W: paid cost shown, zero range hidden.
    const w = screen.getByText("Cadenas Infernales", { selector: "p" }).parentElement!;
    expect(within(w).getByText("20/18s")).toBeInTheDocument();
    expect(within(w).getByText("30/35")).toBeInTheDocument();
    expect(within(w).queryByText(/Rango:/)).not.toBeInTheDocument();

    // E: empty cooldown array → no stats row at all.
    const e = screen.getByText("Impulso Sombrío", { selector: "p" }).parentElement!;
    expect(within(e).queryByText(/CD:/)).not.toBeInTheDocument();
  });
});

describe("ChampionGuideView — tips tab", () => {
  it("shows generic tips plus the curated 'when facing' tips in the UI locale", async () => {
    await renderGuide();
    openTab("Tips");
    expect(screen.getByText("Tips para jugarlo bien")).toBeInTheDocument();
    expect(screen.getByText("Aprende sus combos básicos en práctica antes de SoloQ")).toBeInTheDocument();
    expect(screen.getByText("Cuando lo enfrentas")).toBeInTheDocument();
    expect(screen.getByText(/Mortal Reminder o Executioner's contra su healing/)).toBeInTheDocument();
  });

  it("switches the curated tips to English when the UI locale is en", async () => {
    setPrefs({ uiLocale: "en" });
    await renderGuide();
    openTab("Tips");
    expect(screen.getByText(/stand at the edge to dodge the knock-up/)).toBeInTheDocument();
    expect(screen.queryByText(/pisa el borde/)).not.toBeInTheDocument();
  });

  it("hides the 'when facing' panel for a champion without curated tips", async () => {
    await renderGuide("99");
    openTab("Tips");
    expect(screen.getByText("Tips para jugarlo bien")).toBeInTheDocument();
    expect(screen.queryByText("Cuando lo enfrentas")).not.toBeInTheDocument();
  });

  // Curated tips are keyed by DDragon id ("MissFortune"), not display name.
  it("shows curated tips for a champion whose display name differs from its id", async () => {
    await renderGuide("21");
    openTab("Tips");
    expect(screen.getByText("Cuando lo enfrentas")).toBeInTheDocument();
    expect(screen.getByText(/Esquiva su double-up \(Q\)/)).toBeInTheDocument();
  });
});

describe("ChampionGuideView — AI guide tab", () => {
  it("without a provider key: disabled generate button and a provider-specific hint", async () => {
    await renderGuide();
    openTab("Guía AI");
    await act(async () => {});
    // Cache lookup uses the numeric champion key.
    expect(getCachedGuide).toHaveBeenCalledWith(266, "16.10.1");
    expect(screen.getByText("Guía AI · TOP · 26.10")).toBeInTheDocument();
    expect(screen.getByText(/Genera una guía AI para Aatrox en TOP/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar guía AI" })).toBeDisabled();
    expect(screen.getByText("Necesitas API key (groq) en Prefs. Groq es gratis.")).toBeInTheDocument();
    expect(screen.queryByText("cacheado")).not.toBeInTheDocument();
  });

  it("renders a cached guide immediately with the cached badge", async () => {
    vi.mocked(getCachedGuide).mockResolvedValue({
      championId: 266,
      patch: "16.10.1",
      guideText: "## Win condition\nGana el lado con **sustain**.",
      generatedTsMs: 0,
    });
    await renderGuide();
    openTab("Guía AI");
    await act(async () => {});
    expect(screen.getByText("cacheado")).toBeInTheDocument();
    expect(screen.getByText("Win condition")).toBeInTheDocument();
    expect(screen.getByText("sustain").tagName).toBe("STRONG");
    expect(screen.queryByRole("button", { name: "Generar guía AI" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "regenerar" })).toBeInTheDocument();
  });

  it("generates with the selected role/language, shows progress, then allows a forced regenerate", async () => {
    setPrefs({ groqApiKey: "gsk-test", aiCoachLanguage: "en" });
    let resolve!: (s: string) => void;
    vi.mocked(generateChampionGuide).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await renderGuide();
    fireEvent.click(roleButton("JUNGLE"));
    openTab("Guía AI");
    await act(async () => {});

    const gen = screen.getByRole("button", { name: "Generar guía AI" });
    expect(gen).toBeEnabled();
    expect(screen.queryByText(/Necesitas API key/)).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(gen);
    });
    expect(generateChampionGuide).toHaveBeenCalledWith({
      provider: "groq",
      apiKey: "gsk-test",
      championId: 266,
      championName: "Aatrox",
      role: "JUNGLE",
      patch: "16.10.1",
      language: "en",
      force: false,
    });
    expect(screen.getByText("Generando guía profesional...")).toBeInTheDocument();

    await act(async () => resolve("Primer texto"));
    expect(screen.queryByText("Generando guía profesional...")).not.toBeInTheDocument();
    expect(screen.getByText("Primer texto")).toBeInTheDocument();
    expect(screen.getByText("cacheado")).toBeInTheDocument();

    vi.mocked(generateChampionGuide).mockResolvedValueOnce("Segundo texto");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "regenerar" }));
    });
    expect(generateChampionGuide).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }));
    expect(screen.getByText("Segundo texto")).toBeInTheDocument();
  });

  it.each([
    ["gemini", { geminiApiKey: "gem-key" }, "gem-key"],
    ["anthropic", { anthropicApiKey: "sk-ant-key" }, "sk-ant-key"],
  ] as const)("uses the %s key when that provider is selected", async (provider, keys, expected) => {
    setPrefs({ aiProvider: provider, groqApiKey: "groq-should-not-be-used", ...keys });
    vi.mocked(generateChampionGuide).mockResolvedValue("ok");
    await renderGuide();
    openTab("Guía AI");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generar guía AI" }));
    });
    expect(generateChampionGuide).toHaveBeenCalledWith(
      expect.objectContaining({ provider, apiKey: expected })
    );
  });

  it("shows the error and keeps the generate button when generation fails", async () => {
    setPrefs({ groqApiKey: "gsk-test" });
    vi.mocked(generateChampionGuide).mockRejectedValue(new Error("rate limited"));
    await renderGuide();
    openTab("Guía AI");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generar guía AI" }));
    });
    expect(screen.getByText("Error: rate limited")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar guía AI" })).toBeEnabled();
    expect(screen.queryByText("cacheado")).not.toBeInTheDocument();
  });

  it("renders the markdown subset: headings, paragraphs, lists, bold and italics", async () => {
    vi.mocked(getCachedGuide).mockResolvedValue({
      championId: 266,
      patch: "16.10.1",
      guideText: [
        "# Win condition",
        "Linea uno",
        "linea dos con **negrita**, _cursiva_ y *enfasis*",
        "- bullet **uno**",
        "* bullet dos",
        "## Spikes",
        "### Detalle",
        "snake_case_words quedan igual",
        "1. numerado",
        "",
        "Final",
      ].join("\r\n"),
      generatedTsMs: 0,
    });
    await renderGuide();
    openTab("Guía AI");
    await act(async () => {});

    expect(screen.getByText("Win condition")).toHaveClass("text-accent");
    expect(screen.getByText("Spikes")).toHaveClass("text-accent");
    expect(screen.getByText("Detalle")).toHaveClass("text-white/70");
    expect(screen.getByText("Detalle")).not.toHaveClass("text-accent");

    // Consecutive lines merge into one paragraph; a bullet flushes it.
    const para = screen.getByText("negrita").parentElement!;
    expect(para.tagName).toBe("P");
    expect(para).toHaveTextContent("Linea uno linea dos con negrita, cursiva y enfasis");
    expect(screen.getByText("negrita").tagName).toBe("STRONG");
    expect(screen.getByText("cursiva").tagName).toBe("EM");
    expect(screen.getByText("enfasis").tagName).toBe("EM");

    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["bullet uno", "bullet dos"]);
    expect(screen.getByText("uno").tagName).toBe("STRONG");

    // snake_case is not italicised; numbered lines stay in the paragraph.
    const snake = screen.getByText("snake_case_words quedan igual 1. numerado");
    expect(snake.tagName).toBe("P");
    expect(snake.querySelector("em")).toBeNull();
    // Blank line starts a new paragraph.
    expect(screen.getByText("Final").tagName).toBe("P");
  });
});
