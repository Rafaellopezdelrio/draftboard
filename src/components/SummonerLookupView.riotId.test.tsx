// Player search with a full Riot ID typed into the name box. Reported from
// the app: pasting "Name#TAG" there (tag box left on its "EUW" default)
// searched "Name#TAG#EUW" and failed with "Riot ID no encontrado".

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SummonerLookupView } from "./SummonerLookupView";
import * as riotApi from "../services/riotApi";
import type { ChampionDb } from "../types/champion";

vi.mock("../services/riotApi", () => ({
  getAccountByRiotId: vi.fn(),
  getSummonerByPuuid: vi.fn(async () => null),
  getLeagueEntriesByPuuid: vi.fn(async () => []),
  getTopMasteries: vi.fn(async () => []),
  getRecentMatchIds: vi.fn(async () => []),
  getMatchFull: vi.fn(),
  getRiotProxyUrl: () => "https://proxy.test",
}));
vi.mock("../services/settingsRepo", () => ({ loadSettings: async () => null }));

const db = { patch: "16.21.1", champions: {} } as unknown as ChampionDb;

function search(name: string, tag?: string) {
  render(<SummonerLookupView db={db} onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText("Nombre del invocador"), { target: { value: name } });
  if (tag !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("EUW"), { target: { value: tag } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
}

describe("SummonerLookupView — Riot ID input", () => {
  beforeEach(() => {
    vi.mocked(riotApi.getAccountByRiotId).mockReset();
    vi.mocked(riotApi.getAccountByRiotId).mockResolvedValue({
      puuid: "p1",
      gameName: "Hide on bush",
      tagLine: "KR1",
    });
  });

  it("splits a full Name#TAG typed in the name box", async () => {
    search("Hide on bush#KR1");
    await waitFor(() =>
      expect(riotApi.getAccountByRiotId).toHaveBeenCalledWith(expect.anything(), "Hide on bush", "KR1")
    );
    // The fields show what was actually searched.
    expect(screen.getByPlaceholderText("Nombre del invocador")).toHaveValue("Hide on bush");
    expect(screen.getByPlaceholderText("EUW")).toHaveValue("KR1");
  });

  it("keeps the tag box when the name has no tag after #", async () => {
    search("Faker#", "KR1");
    await waitFor(() =>
      expect(riotApi.getAccountByRiotId).toHaveBeenCalledWith(expect.anything(), "Faker", "KR1")
    );
  });

  it("uses name + tag box as before for a plain name", async () => {
    search("NâmikâzëMinâtöö", "004");
    await waitFor(() =>
      expect(riotApi.getAccountByRiotId).toHaveBeenCalledWith(expect.anything(), "NâmikâzëMinâtöö", "004")
    );
  });

  it("shows the error message without a raw 'Error:' prefix", async () => {
    vi.mocked(riotApi.getAccountByRiotId).mockRejectedValue(new Error("No encontrado"));
    search("Nadie", "EUW");
    expect(await screen.findByText("⚠ No encontrado")).toBeInTheDocument();
  });
});
