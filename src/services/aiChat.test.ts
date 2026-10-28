import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MatchRow } from "./matchRepo";

const callAi = vi.fn();
vi.mock("./aiProvider", () => ({
  callAi: (...a: unknown[]) => callAi(...a),
}));

import { chatWithCoach, type ChatContext, type ChatMessage } from "./aiChat";

function mkRow(over: Partial<MatchRow> = {}): MatchRow {
  return {
    matchId: "m",
    championId: 103,
    win: true,
    kills: 5,
    deaths: 2,
    assists: 7,
    cs: 200,
    durationSec: 1800,
    gameEndTimestampMs: 0,
    queueId: 420,
    position: "MIDDLE",
    opponentChampionId: 157,
    ...over,
  } as MatchRow;
}

function ctx(over: Partial<ChatContext> = {}): ChatContext {
  return {
    recentMatches: [],
    masteries: [],
    personalStats: [],
    currentRank: null,
    championNamesById: { 103: "Ahri", 157: "Yasuo" },
    ...over,
  };
}

const ask: ChatMessage[] = [{ role: "user", content: "¿Cómo gano vs Yasuo?" }];

beforeEach(() => {
  callAi.mockReset().mockResolvedValue("respuesta");
});

describe("chatWithCoach", () => {
  it("rejects when the history is empty", async () => {
    await expect(chatWithCoach("groq", "", [], ctx())).rejects.toThrow(
      "El último mensaje debe ser del usuario"
    );
    expect(callAi).not.toHaveBeenCalled();
  });

  it("rejects when the last message is from the assistant", async () => {
    const history: ChatMessage[] = [...ask, { role: "assistant", content: "hola" }];
    await expect(chatWithCoach("groq", "", history, ctx())).rejects.toThrow(
      "El último mensaje debe ser del usuario"
    );
    expect(callAi).not.toHaveBeenCalled();
  });

  it("sends the last user message as the prompt and the rest as history", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "hola" },
      { role: "assistant", content: "¿en qué te ayudo?" },
      { role: "user", content: "analiza mi Ahri" },
    ];
    const out = await chatWithCoach("anthropic", "sk-test", history, ctx());
    expect(out).toBe("respuesta");
    const p = callAi.mock.calls[0][0];
    expect(p).toMatchObject({
      provider: "anthropic",
      apiKey: "sk-test",
      userPrompt: "analiza mi Ahri",
      history: history.slice(0, 2),
      maxTokens: 800,
    });
  });

  it("grounds the Spanish system prompt in the player's real data", async () => {
    await chatWithCoach(
      "groq",
      "",
      ask,
      ctx({
        currentRank: { tier: "GOLD", division: "II", lp: 47 },
        recentMatches: [
          mkRow({ championId: 103, win: true, kills: 5, deaths: 2, assists: 7 }),
          mkRow({ championId: 999, win: false, kills: 1, deaths: 6, assists: 0, position: "TOP" }),
          mkRow({ win: true }),
        ],
        personalStats: [
          { championId: 103, games: 10, wins: 6, winRate: 0.6 },
          { championId: 157, games: 2, wins: 2, winRate: 1 }, // < 3 games: excluded
          { championId: 888, games: 4, wins: 1, winRate: 0.25 },
        ],
        masteries: [
          { championId: 103, championLevel: 7, championPoints: 251_600, lastPlayTime: 0 },
        ],
      })
    );
    const sys: string = callAi.mock.calls[0][0].systemPrompt;
    expect(sys).toContain("Rango: GOLD II 47LP");
    expect(sys).toContain("Winrate reciente: 2/3 (67%)");
    expect(sys).toContain("Más jugados: Ahri: 10g 60%WR, #888: 4g 25%WR");
    expect(sys).not.toContain("Yasuo: 2g");
    expect(sys).toContain("Top maestría: Ahri (M7, 252k)");
    expect(sys).toContain("Últimas 10 partidas: W Ahri MIDDLE 5/2/7; L #999 TOP 1/6/0; W Ahri MIDDLE 5/2/7");
    expect(sys).toContain("Responde en español.");
  });

  it("caps the Spanish prompt at 5 top champs, 5 masteries and 10 matches", async () => {
    const names: Record<number, string> = {};
    for (let i = 1; i <= 12; i++) names[i] = `C${i}`;
    await chatWithCoach(
      "groq",
      "",
      ask,
      ctx({
        championNamesById: names,
        recentMatches: Array.from({ length: 12 }, (_, i) => mkRow({ championId: i + 1 })),
        personalStats: Array.from({ length: 7 }, (_, i) => ({
          championId: i + 1,
          games: 5,
          wins: 5,
          winRate: 1,
        })),
        masteries: Array.from({ length: 7 }, (_, i) => ({
          championId: i + 1,
          championLevel: 5,
          championPoints: 1000,
          lastPlayTime: 0,
        })),
      })
    );
    const sys: string = callAi.mock.calls[0][0].systemPrompt;
    expect(sys).toContain("C5: 5g 100%WR");
    expect(sys).not.toContain("C6: 5g");
    expect(sys).toContain("C5 (M5, 1k)");
    expect(sys).not.toContain("C6 (M5");
    expect(sys).toContain("W C10 MIDDLE");
    expect(sys).not.toContain("W C11 MIDDLE");
    // Winrate still counts all 12 matches.
    expect(sys).toContain("Winrate reciente: 12/12 (100%)");
  });

  it("uses Spanish placeholders when there is no data", async () => {
    await chatWithCoach("groq", "", ask, ctx());
    const sys: string = callAi.mock.calls[0][0].systemPrompt;
    expect(sys).toContain("Rango: Sin rango detectado");
    expect(sys).toContain("Winrate reciente: 0/0 (?%)");
    expect(sys).toContain("Más jugados: sin datos aún");
    expect(sys).toContain("Top maestría: sin datos aún");
    expect(sys).toContain("Últimas 10 partidas: ninguna");
  });

  it("builds an English system prompt when language is en", async () => {
    await chatWithCoach(
      "groq",
      "",
      ask,
      ctx({
        currentRank: { tier: "EMERALD", division: "IV", lp: 0 },
        recentMatches: [mkRow({ win: false })],
      }),
      "en"
    );
    const sys: string = callAi.mock.calls[0][0].systemPrompt;
    expect(sys).toContain("You are a professional League of Legends coach");
    expect(sys).toContain("- Rank: EMERALD IV 0LP");
    expect(sys).toContain("- Recent winrate: 0/1 (0%)");
    expect(sys).toContain("- Top played: no data yet");
    expect(sys).toContain("- Top mastery: no data yet");
    expect(sys).toContain("- Last 10 matches: L Ahri MIDDLE 5/2/7");
    expect(sys).toContain("Use English.");
    expect(sys).not.toContain("Responde en español");
  });

  it("uses English placeholders when there are no matches", async () => {
    await chatWithCoach("groq", "", ask, ctx(), "en");
    const sys: string = callAi.mock.calls[0][0].systemPrompt;
    expect(sys).toContain("- Recent winrate: 0/0 (?%)");
    expect(sys).toContain("- Last 10 matches: none");
  });

  it("does not leak the Spanish unranked placeholder into the English prompt", async () => {
    await chatWithCoach("groq", "", ask, ctx(), "en");
    const sys: string = callAi.mock.calls[0][0].systemPrompt;
    expect(sys).not.toContain("Sin rango detectado");
    expect(sys).toContain("- Rank: No rank detected");
  });

  it("propagates provider errors", async () => {
    callAi.mockRejectedValue(new Error("401"));
    await expect(chatWithCoach("groq", "", ask, ctx())).rejects.toThrow("401");
  });
});
