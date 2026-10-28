// Diagnostics must not tell a default user that keys are missing: Riot and
// Groq calls go through the Draftboard worker, which adds the keys
// server-side. Reported from the app (three yellow "!" rows for things that
// were working).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiagnosticsView } from "./DiagnosticsView";
import * as riotApi from "../services/riotApi";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "lcu_current_summoner") return { puuid: "abcdefgh1234", gameName: "Tester" };
    throw new Error("no game");
  }),
}));
vi.mock("../services/dataDragon", () => ({ fetchLatestPatch: async () => "16.21.1" }));
vi.mock("../services/settingsRepo", () => ({ loadSettings: async () => null }));
vi.mock("../services/riotApi", () => ({ getAccount: vi.fn(), getRiotProxyUrl: vi.fn() }));
vi.mock("../db/client", () => ({ getDb: async () => ({ select: async () => [] }) }));

/** Status glyph of the row whose detail text matches. */
async function statusOf(detail: string): Promise<string | null | undefined> {
  const row = (await screen.findByText(detail)).closest("div.flex");
  return row?.querySelector("span")?.textContent;
}

describe("DiagnosticsView key checks", () => {
  beforeEach(() => {
    // jsdom here exposes no localStorage; the AI probe reads prefs from it.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
  });

  it("reports Riot + Groq as fine when the worker proxy is on and the user has no keys", async () => {
    vi.mocked(riotApi.getRiotProxyUrl).mockReturnValue("https://proxy.test");
    render(<DiagnosticsView onClose={() => {}} />);

    expect(await statusOf("No hace falta: el servidor de Draftboard la pone por ti")).toBe("✓");
    expect(await statusOf("No hace falta: Groq gratis a través del servidor de Draftboard")).toBe("✓");
    // Out of a match the Live Client is just off — not a warning.
    expect(await statusOf("Se activa sola cuando entras en partida")).toBe("✓");
    expect(riotApi.getAccount).not.toHaveBeenCalled();
  });

  it("still warns about missing keys when the proxy is disabled", async () => {
    vi.mocked(riotApi.getRiotProxyUrl).mockReturnValue(null);
    render(<DiagnosticsView onClose={() => {}} />);

    expect(
      await statusOf("No configurada (opcional, solo necesaria para scout y meta global)")
    ).toBe("!");
    expect(await statusOf("No configurada (opcional, groq). Groq es gratis.")).toBe("!");
  });
});
