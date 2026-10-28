// TierListView contract:
//   - Single-role view sorts by tier (S+ first) with section headers; intra-tier
//     rows are always winrate desc.
//   - Column headers toggle sort key/direction; role tabs + search filter rows.
//   - Source / dpm.lol bracket selectors persist the pref, force-reload the
//     championDb and hand the fresh db to the parent.
//   - Empty meta renders the sync hint instead of the table.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { TierListView } from "./TierListView";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";
import type { ChampionDb, MetaTier } from "../types/champion";

vi.mock("../services/championDb", () => ({
  loadChampionDb: vi.fn(),
}));

import { loadChampionDb } from "../services/championDb";

function champ(key: string, name: string) {
  return { key, id: name, name, iconUrl: `https://cdn.test/${key}.png`, roles: [], tags: [] };
}

function meta(
  championKey: string,
  role: MetaTier["role"],
  tier: MetaTier["tier"],
  winRate: number,
  pickRate: number,
  banRate: number
): MetaTier {
  return { championKey, role, tier, winRate, pickRate, banRate };
}

const CHAMPIONS = {
  "266": champ("266", "Aatrox"),
  "84": champ("84", "Akali"),
  "122": champ("122", "Darius"),
  "86": champ("86", "Garen"),
  "103": champ("103", "Ahri"),
  "64": champ("64", "Lee Sin"),
  "432": champ("432", "Bard"),
};

// Meta order is intentionally NOT tier-sorted so sorting is observable.
const META: MetaTier[] = [
  meta("266", "TOP", "S", 0.52, 0.08, 0.05),
  meta("84", "TOP", "S+", 0.5, 0.1, 0.2),
  meta("122", "TOP", "S", 0.545, 0.06, 0.12),
  meta("86", "TOP", "A", 0.48, 0.15, 0.01),
  meta("103", "MIDDLE", "S", 0.53, 0.09, 0.03),
  meta("64", "JUNGLE", "B", 0.49, 0.11, 0.04),
  meta("432", "UTILITY", "C", 0.47, 0.02, 0.0),
];

function mkDb(over: Partial<ChampionDb> = {}): ChampionDb {
  return {
    patch: "16.10.1",
    champions: CHAMPIONS,
    counters: [],
    meta: META,
    fetchedAt: 0,
    ...over,
  } as unknown as ChampionDb;
}

function setPrefs(over: Partial<typeof DEFAULT_PREFS>) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

/** Champion names in rendered row order (row icons carry alt=name). */
function rowOrder(): string[] {
  return screen.getAllByRole("img").map((i) => i.getAttribute("alt") ?? "");
}

function sourceSelect(): HTMLSelectElement {
  // The source selector is always the first <select> in the header.
  return screen.getAllByRole("combobox")[0] as HTMLSelectElement;
}

beforeEach(() => {
  setPrefs({});
  vi.mocked(loadChampionDb).mockReset();
});

describe("TierListView — default single-role tier view", () => {
  it("sorts TOP by tier (S+ first) with winrate-desc inside a tier", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    expect(rowOrder()).toEqual(["Akali", "Darius", "Aatrox", "Garen"]);
  });

  it("renders a section header per tier with singular/plural champion counts", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    const headers = screen.getAllByText(/ Tier$/).map((el) => el.textContent);
    expect(headers).toEqual(["S+ Tier", "S Tier", "A Tier"]);
    expect(screen.getByText("· 2 campeones")).toBeInTheDocument();
    expect(screen.getAllByText("· 1 campeón")).toHaveLength(2);
  });

  it("shows the diagnostic counter with total, in-role count and top S champions", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    expect(screen.getByText(/entries/)).toHaveTextContent(
      "7 entries · 4 in TOP · top S: Aatrox, Akali, Darius"
    );
  });

  it("formats rates as percentages and colours winrate by threshold", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    expect(screen.getByText("54.5%")).toHaveClass("text-good");
    expect(screen.getByText("50.0%")).toHaveClass("text-white/85");
    expect(screen.getByText("48.0%")).toHaveClass("text-bad");
    // Akali pick/ban
    expect(screen.getByText("10.0%")).toBeInTheDocument();
    expect(screen.getByText("20.0%")).toBeInTheDocument();
  });

  it("footer shows the row count and the year-based patch label", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    expect(screen.getByText("4 campeones · patch 26.10")).toBeInTheDocument();
    expect(screen.getByText("Ordenar: click en cabecera")).toBeInTheDocument();
  });

  it("clicking a row reports the champion key to onSelectChampion", () => {
    const onSelect = vi.fn();
    render(<TierListView db={mkDb()} onClose={() => {}} onSelectChampion={onSelect} />);
    fireEvent.click(screen.getByText("Darius"));
    expect(onSelect).toHaveBeenCalledWith("122");
  });
});

describe("TierListView — sorting", () => {
  it("winrate header sorts desc first, then asc on second click, without sections", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    const wr = screen.getByRole("columnheader", { name: "Winrate" });
    fireEvent.click(wr);
    expect(rowOrder()).toEqual(["Darius", "Aatrox", "Akali", "Garen"]);
    expect(screen.queryAllByText(/ Tier$/)).toHaveLength(0);
    expect(within(wr).getByText("Winrate")).toHaveClass("text-accent");
    fireEvent.click(wr);
    expect(rowOrder()).toEqual(["Garen", "Akali", "Aatrox", "Darius"]);
  });

  it("champion header sorts by name (desc then asc)", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    const name = screen.getByRole("columnheader", { name: "Campeón" });
    fireEvent.click(name);
    expect(rowOrder()).toEqual(["Garen", "Darius", "Akali", "Aatrox"]);
    fireEvent.click(name);
    expect(rowOrder()).toEqual(["Aatrox", "Akali", "Darius", "Garen"]);
  });

  it("pickrate and banrate headers sort by their own column", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("columnheader", { name: "Pickrate" }));
    expect(rowOrder()).toEqual(["Garen", "Akali", "Aatrox", "Darius"]);
    fireEvent.click(screen.getByRole("columnheader", { name: "Banrate" }));
    expect(rowOrder()).toEqual(["Akali", "Darius", "Aatrox", "Garen"]);
  });

  it("re-clicking Tier flips to desc (D→S+) but keeps intra-tier winrate desc", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("columnheader", { name: "Tier" }));
    expect(rowOrder()).toEqual(["Garen", "Darius", "Aatrox", "Akali"]);
    expect(screen.getAllByText(/ Tier$/).map((e) => e.textContent)).toEqual([
      "A Tier",
      "S Tier",
      "S+ Tier",
    ]);
  });

  it("non-sortable Rol header does nothing on click", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("columnheader", { name: "Rol" }));
    expect(rowOrder()).toEqual(["Akali", "Darius", "Aatrox", "Garen"]);
  });
});

describe("TierListView — role tabs + search", () => {
  it("'Todos' tab shows every role and drops tier sections", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Todos" }));
    expect(rowOrder()).toEqual([
      "Akali",
      "Darius",
      "Ahri",
      "Aatrox",
      "Garen",
      "Lee Sin",
      "Bard",
    ]);
    expect(screen.queryAllByText(/ Tier$/)).toHaveLength(0);
    expect(screen.getByText(/entries/)).toHaveTextContent("7 entries · 7 in ALL");
  });

  it("switching to Mid shows only that role with singular footer", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Mid" }));
    expect(rowOrder()).toEqual(["Ahri"]);
    expect(screen.getByText("1 campeón · patch 26.10")).toBeInTheDocument();
  });

  it("search narrows rows case-insensitively by champion name", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Buscar campeón..."), {
      target: { value: "AK" },
    });
    expect(rowOrder()).toEqual(["Akali"]);
  });

  it("search excludes meta entries whose champion is missing from the db", () => {
    const db = mkDb({ meta: [...META, meta("999", "TOP", "S", 0.6, 0.1, 0.1)] });
    render(<TierListView db={db} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Buscar campeón..."), {
      target: { value: "a" },
    });
    expect(screen.getByText("4 campeones · patch 26.10")).toBeInTheDocument();
  });

  it("diagnostic counter falls back to the champion key for unknown champions", () => {
    const db = mkDb({ meta: [meta("999", "MIDDLE", "S+", 0.6, 0.1, 0.1), ...META] });
    render(<TierListView db={db} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Mid" }));
    expect(screen.getByText(/entries/)).toHaveTextContent("8 entries · 2 in MIDDLE · top S: 999, Ahri");
    // The unknown entry is not rendered as a row.
    expect(rowOrder()).toEqual(["Ahri"]);
  });

  // BUG: rows whose champion is missing from db.champions are skipped at render
  // time (`if (!c) return null`) but still counted in the footer, the tier
  // section counts and the row numbering. With one unknown entry in MIDDLE the
  // footer claims "2 campeones" while only Ahri is shown.
  it.skip("footer count matches the rows actually rendered when a champion is unknown", () => {
    const db = mkDb({ meta: [meta("999", "MIDDLE", "S+", 0.6, 0.1, 0.1), ...META] });
    render(<TierListView db={db} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Mid" }));
    expect(screen.getByText("1 campeón · patch 26.10")).toBeInTheDocument();
  });
});

describe("TierListView — empty state", () => {
  it("renders the sync hint and no table when meta is empty", () => {
    render(<TierListView db={mkDb({ meta: [] })} onClose={() => {}} />);
    expect(screen.getByText("Sin datos del meta aún")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/patch/)).toBeNull();
    expect(screen.getByText(/entries/)).toHaveTextContent("0 entries · 0 in TOP");
  });
});

describe("TierListView — source selector", () => {
  it("dpm source shows the bracket label in the title and the rank/region/time selects", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    expect(screen.getByText("dpm.lol · Emerald+ · EUW")).toBeInTheDocument();
    expect(screen.getByTitle("Rango (Iron → Challenger)")).toHaveValue("emerald_plus");
    expect(screen.getByTitle("Región")).toHaveValue("euw1");
    expect(screen.getByTitle("Ventana de tiempo")).toHaveValue("7days");
  });

  it("non-dpm source hides the dpm bracket label and selects", () => {
    setPrefs({ metaSource: "proplay" });
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    expect(screen.queryByText(/^dpm\.lol ·/)).toBeNull();
    expect(screen.queryByTitle("Región")).toBeNull();
  });

  it("lists only sources with synced data, hiding legacy op.gg unless it is active", () => {
    const db = mkDb({ metaSourceCounts: { opgg: 10, proplay: 5, soloq: 0, dpm: 50 } });
    const { unmount } = render(<TierListView db={db} onClose={() => {}} />);
    let options = within(sourceSelect()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["dpm.lol (por rango) · 50", "Pro play · 5", "Pro + SoloQ blend"]);
    unmount();

    setPrefs({ metaSource: "opgg" });
    render(<TierListView db={{ ...db, metaSourceCounts: { opgg: 10, proplay: 0, soloq: 3, dpm: 0 } }} onClose={() => {}} />);
    options = within(sourceSelect()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "dpm.lol (por rango)",
      "op.gg (legacy · 10)",
      "SoloQ Master+ · 3",
      "Pro + SoloQ blend",
    ]);
  });

  it("without source counts only the dpm option is offered", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    const options = within(sourceSelect()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["dpm.lol (por rango)"]);
  });

  it("flags a fallback when the used source differs from the requested one", () => {
    render(
      <TierListView
        db={mkDb({ metaSourceRequested: "proplay", metaSourceUsed: "opgg" })}
        onClose={() => {}}
      />
    );
    const badge = screen.getByText("⚠ usando opgg");
    expect(badge).toHaveAttribute(
      "title",
      'Pediste "proplay" pero no hay datos; mostrando "opgg" como fallback.'
    );
  });

  it("no fallback badge when used === requested", () => {
    render(
      <TierListView
        db={mkDb({ metaSourceRequested: "dpm", metaSourceUsed: "dpm" })}
        onClose={() => {}}
      />
    );
    expect(screen.queryByText(/usando/)).toBeNull();
  });

  it("changing the source persists the pref, force-reloads and hands the fresh db up", async () => {
    const fresh = mkDb({ patch: "16.11.1" });
    // loadChampionDb reads the source from prefsStore, so the pref must already
    // be saved when the reload starts.
    let sourceAtReload: string | undefined;
    vi.mocked(loadChampionDb).mockImplementation(async () => {
      sourceAtReload = usePrefsStore.getState().prefs.metaSource;
      return fresh;
    });
    const onDbUpdate = vi.fn();
    render(<TierListView db={mkDb({ metaSourceCounts: { opgg: 0, proplay: 5, soloq: 0, dpm: 1 } })} onClose={() => {}} onDbUpdate={onDbUpdate} />);

    await act(async () => {
      fireEvent.change(sourceSelect(), { target: { value: "proplay" } });
    });

    expect(usePrefsStore.getState().prefs.metaSource).toBe("proplay");
    expect(loadChampionDb).toHaveBeenCalledWith(true);
    expect(sourceAtReload).toBe("proplay");
    expect(onDbUpdate).toHaveBeenCalledWith(fresh);
  });

  it("disables the selectors and shows 'Actualizando…' while the reload is in flight", async () => {
    let resolve!: (db: ChampionDb) => void;
    vi.mocked(loadChampionDb).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<TierListView db={mkDb()} onClose={() => {}} />);

    await act(async () => {
      fireEvent.change(screen.getByTitle("Rango (Iron → Challenger)"), {
        target: { value: "gold" },
      });
    });
    expect(screen.getByText("Actualizando…")).toBeInTheDocument();
    for (const s of screen.getAllByRole("combobox")) expect(s).toBeDisabled();

    await act(async () => {
      resolve(mkDb());
    });
    expect(screen.queryByText("Actualizando…")).toBeNull();
    for (const s of screen.getAllByRole("combobox")) expect(s).toBeEnabled();
    // Title reflects the new bracket from prefs.
    expect(screen.getByText("dpm.lol · Gold · EUW")).toBeInTheDocument();
  });

  it("region and timeframe selects persist their prefs and reload", async () => {
    vi.mocked(loadChampionDb).mockResolvedValue(mkDb());
    render(<TierListView db={mkDb()} onClose={() => {}} />);

    await act(async () => {
      fireEvent.change(screen.getByTitle("Región"), { target: { value: "kr" } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTitle("Ventana de tiempo"), { target: { value: "30days" } });
    });

    const prefs = usePrefsStore.getState().prefs;
    expect(prefs.dpmPlatform).toBe("kr");
    expect(prefs.dpmTimeframe).toBe("30days");
    expect(loadChampionDb).toHaveBeenCalledTimes(2);
    expect(screen.getByText("dpm.lol · Emerald+ · Korea")).toBeInTheDocument();
  });

  // BUG: applyFilter has try/finally but no catch, and onChange drops the
  // returned promise. When loadChampionDb rejects (offline: DDragon fetch
  // throws after retries) the error escapes as an unhandled promise rejection
  // and the user gets no feedback. Expected: the failure is caught (and ideally
  // surfaced), controls re-enable.
  it.skip("a failed reload is handled without an unhandled rejection", async () => {
    vi.mocked(loadChampionDb).mockRejectedValue(new Error("offline"));
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    await act(async () => {
      fireEvent.change(screen.getByTitle("Región"), { target: { value: "kr" } });
    });
    for (const s of screen.getAllByRole("combobox")) expect(s).toBeEnabled();
  });
});

describe("TierListView — dialog behaviour", () => {
  it("exposes an accessible modal dialog labelled by its title", () => {
    render(<TierListView db={mkDb()} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)).toHaveTextContent(
      "Tier List"
    );
  });

  it("closes on Escape and on backdrop click, not on clicks inside the panel", () => {
    const onClose = vi.fn();
    render(<TierListView db={mkDb()} onClose={onClose} />);
    fireEvent.click(screen.getByText("Darius"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
