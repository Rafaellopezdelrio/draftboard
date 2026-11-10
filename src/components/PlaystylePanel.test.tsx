// PlaystylePanel contract: archetype label, tip and trait chips follow the UI
// language (the engine only knows Spanish text, the panel maps it to i18n ids).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import i18n from "i18next";
import { PlaystylePanel } from "./PlaystylePanel";
import type { PlaystyleProfile } from "../engine/playstyleEngine";

vi.mock("../services/matchRepo", () => ({ recentMatches: vi.fn() }));
vi.mock("../engine/playstyleEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/playstyleEngine")>();
  return { ...actual, buildPlaystyleProfile: vi.fn() };
});

import { recentMatches } from "../services/matchRepo";
import { buildPlaystyleProfile } from "../engine/playstyleEngine";

beforeEach(() => {
  vi.mocked(recentMatches).mockResolvedValue([]);
});

async function renderPanel(profile: Partial<PlaystyleProfile> | null) {
  vi.mocked(buildPlaystyleProfile).mockReturnValue(profile as PlaystyleProfile | null);
  const utils = render(<PlaystylePanel />);
  await act(async () => {});
  // Open the collapsed panel so the body is rendered.
  const toggle = utils.container.querySelector("button");
  if (toggle) await act(async () => toggle.click());
  return utils;
}

describe("PlaystylePanel", () => {
  it("renders nothing without a profile", async () => {
    const { container } = await renderPanel(null);
    expect(container.textContent).toBe("");
  });

  it("shows label, tip and traits in the UI language, not the engine's Spanish", async () => {
    i18n.addResourceBundle(
      "zz",
      "translation",
      {
        playstyle: {
          title: "STYLE",
          archetypes: { aggressive: { label: "ZZ-LABEL", tip: "ZZ-TIP" } },
          traits: { highDeaths: "ZZ-DEATHS", greatFarm: "ZZ-FARM" },
        },
      },
      true,
      true
    );
    await act(async () => {
      await i18n.changeLanguage("zz");
    });
    try {
      const { container } = await renderPanel({
        archetype: "aggressive",
        traits: ["Mueres mucho — riesgo alto", "Excelente farm", "Rasgo sin mapa"],
      });
      const text = container.textContent ?? "";
      expect(text).toContain("ZZ-LABEL");
      expect(text).toContain("ZZ-TIP");
      expect(text).toContain("ZZ-DEATHS");
      expect(text).toContain("ZZ-FARM");
      expect(text).not.toContain("Agresivo");
      expect(text).not.toContain("Buscas peleas");
      expect(text).not.toContain("Mueres mucho");
      // A trait the panel does not know is shown as the engine wrote it.
      expect(text).toContain("Rasgo sin mapa");
    } finally {
      await act(async () => {
        await i18n.changeLanguage("es");
      });
    }
  });
});
