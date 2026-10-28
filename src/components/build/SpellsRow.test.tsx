// SpellsRow: spell names/icons from SUMMONER_SPELL_META (with an id fallback
// for unknown spells), WR/PR formatting + colour bands, the coherence reason
// line, and the pref-gated "Aplicar" button that pushes the pair to champ
// select (applying → applied flash → reset; error toast when not in lobby).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SpellsRow } from "./SpellsRow";
import { ToastProvider } from "../ui/ToastContainer";
import { usePrefsStore, DEFAULT_PREFS } from "../../state/prefsStore";
import { UI_FEEDBACK_MS } from "../../config";
import * as lcu from "../../services/lcuService";

vi.mock("../../services/lcuService", () => ({ applySummonerSpells: vi.fn() }));

const PATCH = "16.21.1";

type Props = Parameters<typeof SpellsRow>[0];
const BASE: Props = {
  spell1Id: 4,
  spell2Id: 14,
  patch: PATCH,
  pickRate: 0.734,
  winRate: 0.525,
  reason: "Recomendación dominante de op.gg",
  overrode: false,
};

function renderRow(over: Partial<Props> = {}) {
  return render(
    <ToastProvider>
      <SpellsRow {...BASE} {...over} />
    </ToastProvider>
  );
}

function setShowButton(on: boolean) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, showSpellImportButton: on } });
}

beforeEach(() => setShowButton(true));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("SpellsRow — display", () => {
  it("names both spells and points their icons at DDragon", () => {
    renderRow();
    expect(screen.getByText("Hechizos de invocador")).toBeInTheDocument();
    expect(screen.getByText("Flash + Ignite")).toBeInTheDocument();
    expect(screen.getByAltText("Flash")).toHaveAttribute(
      "src",
      `https://ddragon.leagueoflegends.com/cdn/${PATCH}/img/spell/SummonerFlash.png`
    );
    expect(screen.getByAltText("Ignite")).toHaveAttribute(
      "src",
      `https://ddragon.leagueoflegends.com/cdn/${PATCH}/img/spell/SummonerDot.png`
    );
  });

  it("formats WR / PR as whole percentages", () => {
    renderRow();
    expect(screen.getByText("53% WR")).toBeInTheDocument();
    expect(screen.getByText("73% PR")).toBeInTheDocument();
  });

  it.each([
    [0.52, "text-good"],
    [0.5, "text-white/65"],
    [0.49, "text-white/65"],
    [0.48, "text-bad/80"],
  ])("colours a %s win rate with %s", (winRate, cls) => {
    renderRow({ winRate });
    expect(screen.getByText(`${(winRate * 100).toFixed(0)}% WR`).className).toContain(cls);
  });

  it("falls back to 'Spell <id>' for spells missing from the meta table", () => {
    renderRow({ spell1Id: 4, spell2Id: 99 });
    expect(screen.getByText("Flash + Spell 99")).toBeInTheDocument();
    // Unknown spell icon uses the generic CommunityDragon fallback + i18n alt.
    expect(screen.getByAltText("Hechizo 99")).toHaveAttribute(
      "src",
      "https://raw.communitydragon.org/latest/game/data/spells/icons2d/summoner_flash.png"
    );
  });

  it("prefixes the reason with an arrow only when coherence overrode op.gg", () => {
    const { unmount } = renderRow({ reason: "ADC estándar → Heal", overrode: true });
    const line = screen.getByText(/ADC estándar → Heal/);
    expect(line.textContent).toBe("↳ ADC estándar → Heal");
    expect(line.className).toContain("text-accent/70");
    unmount();

    renderRow({ reason: "Recomendación dominante de op.gg", overrode: false });
    const plain = screen.getByText("Recomendación dominante de op.gg");
    expect(plain.textContent).toBe("Recomendación dominante de op.gg");
    expect(plain.className).toContain("text-white/30");
  });

  it("hides the apply button when the pref is off", () => {
    setShowButton(false);
    renderRow();
    expect(screen.queryByRole("button", { name: "Aplicar" })).toBeNull();
  });
});

describe("SpellsRow — apply", () => {
  it("disables the button while the LCU call is in flight", async () => {
    let resolve!: (ok: boolean) => void;
    vi.mocked(lcu.applySummonerSpells).mockReturnValue(
      new Promise<boolean>((r) => {
        resolve = r;
      })
    );
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    const busy = screen.getByRole("button", { name: "..." });
    expect(busy).toBeDisabled();
    expect(busy.className).toContain("opacity-50");
    expect(lcu.applySummonerSpells).toHaveBeenCalledWith(4, 14);

    await act(async () => resolve(true));
    expect(screen.getByRole("button", { name: "✓ Aplicado" })).toBeEnabled();
  });

  it("flashes 'Aplicado' + success toast with spell names, then resets", async () => {
    vi.useFakeTimers();
    vi.mocked(lcu.applySummonerSpells).mockResolvedValue(true);
    renderRow({ spell1Id: 4, spell2Id: 12 });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    });

    const btn = screen.getByRole("button", { name: "✓ Aplicado" });
    expect(btn.className).toContain("text-good");
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Hechizos aplicados");
    expect(toast).toHaveTextContent("Flash + Teleport");

    act(() => vi.advanceTimersByTime(UI_FEEDBACK_MS.appliedFlash));
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✓ Aplicado" })).toBeNull();
  });

  it("uses the id fallback in the success toast for unknown spells", async () => {
    vi.mocked(lcu.applySummonerSpells).mockResolvedValue(true);
    renderRow({ spell1Id: 98, spell2Id: 99 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Spell 98 + Spell 99");
  });

  it("shows an error toast and keeps the button idle when not in champ select", async () => {
    vi.mocked(lcu.applySummonerSpells).mockResolvedValue(false);
    renderRow();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Error aplicando hechizos");
    expect(alert).toHaveTextContent("Asegúrate de estar en champ select.");
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled();
    expect(screen.queryByText(/Aplicado/)).toBeNull();
  });
});
