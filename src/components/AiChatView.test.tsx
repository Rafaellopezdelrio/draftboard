// AiChatView contract:
//   - On mount builds the chat context (last 20 matches, personal stats,
//     masteries, LCU rank, champion names by numeric key).
//   - Sending: needs a non-blank text, a loaded context, no request in flight
//     and an API key for the selected provider (else an error banner).
//   - Each conversation is persisted best-effort (create once, append user +
//     assistant); persistence failures never break the chat.
//   - History browser: list, search (stale results discarded), resume,
//     delete (deleting the open conversation resets to a new chat).
//   - Escape / backdrop click close the dialog.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AiChatView } from "./AiChatView";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import type { ChampionDb } from "../types/champion";
import type { MatchRow } from "../services/matchRepo";
import type { ConversationMeta } from "../services/chatRepo";

vi.mock("../services/chatRepo", () => ({
  createConversation: vi.fn(),
  appendMessage: vi.fn(),
  listConversations: vi.fn(),
  loadMessages: vi.fn(),
  searchConversations: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock("../services/aiChat", () => ({ chatWithCoach: vi.fn() }));
vi.mock("../services/matchRepo", () => ({
  recentMatches: vi.fn(),
  personalStatsByChampion: vi.fn(),
}));
vi.mock("../services/lcuPersonalData", () => ({
  lcuMasteries: vi.fn(),
  lcuRank: vi.fn(),
}));

import {
  createConversation,
  appendMessage,
  listConversations,
  loadMessages,
  searchConversations,
  deleteConversation,
} from "../services/chatRepo";
import { chatWithCoach } from "../services/aiChat";
import { recentMatches, personalStatsByChampion } from "../services/matchRepo";
import { lcuMasteries, lcuRank } from "../services/lcuPersonalData";

const db = {
  patch: "16.10.1",
  champions: {
    "266": { key: "266", id: "Aatrox", name: "Aatrox", iconUrl: "x", roles: [], tags: [] },
    "64": { key: "64", id: "LeeSin", name: "Lee Sin", iconUrl: "x", roles: [], tags: [] },
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

const MATCHES = [{ matchId: "EUW1_1" }] as unknown as MatchRow[];
const STATS = [{ championId: 266, games: 3 }];
const MASTERIES = [{ championId: 64, championPoints: 1000 }];

function setPrefs(over: Partial<Preferences> = {}) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderView(onClose = vi.fn()) {
  const utils = render(<AiChatView db={db} onClose={onClose} />);
  await act(async () => {});
  return { ...utils, onClose };
}

function input() {
  return screen.getByPlaceholderText(/Escribe tu pregunta|Esperando respuesta/);
}

async function typeAndSend(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // jsdom has no Element.scrollTo; the auto-scroll effect calls it.
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  setPrefs({ aiProvider: "groq", groqApiKey: "gsk-test", aiCoachLanguage: "en" });
  vi.mocked(recentMatches).mockResolvedValue(MATCHES);
  vi.mocked(personalStatsByChampion).mockResolvedValue(STATS as never);
  vi.mocked(lcuMasteries).mockResolvedValue(MASTERIES as never);
  vi.mocked(lcuRank).mockResolvedValue({
    tier: "GOLD",
    division: "II",
    leaguePoints: 42,
    wins: 10,
    losses: 8,
    hotStreak: false,
  });
  vi.mocked(createConversation).mockResolvedValue(7);
  vi.mocked(appendMessage).mockResolvedValue(undefined as never);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(searchConversations).mockResolvedValue([]);
  vi.mocked(loadMessages).mockResolvedValue([]);
  vi.mocked(deleteConversation).mockResolvedValue(undefined);
  vi.mocked(chatWithCoach).mockResolvedValue("Farmea mejor.");
});

describe("AiChatView — context + sending", () => {
  it("builds the chat context on mount and passes it to chatWithCoach", async () => {
    await renderView();
    expect(recentMatches).toHaveBeenCalledWith(20);

    await typeAndSend("¿Qué juego?");

    expect(chatWithCoach).toHaveBeenCalledTimes(1);
    const [provider, key, history, ctx, lang] = vi.mocked(chatWithCoach).mock.calls[0];
    expect(provider).toBe("groq");
    expect(key).toBe("gsk-test");
    expect(history).toEqual([{ role: "user", content: "¿Qué juego?" }]);
    expect(lang).toBe("en");
    expect(ctx).toEqual({
      recentMatches: MATCHES,
      masteries: MASTERIES,
      personalStats: STATS,
      currentRank: { tier: "GOLD", division: "II", lp: 42 },
      championNamesById: { 266: "Aatrox", 64: "Lee Sin" },
    });
  });

  it("maps a missing LCU rank to currentRank null", async () => {
    vi.mocked(lcuRank).mockResolvedValue(null);
    await renderView();
    await typeAndSend("hola");
    expect(vi.mocked(chatWithCoach).mock.calls[0][3].currentRank).toBeNull();
  });

  it("renders the user and assistant bubbles, persists both and counts messages", async () => {
    await renderView();
    expect(screen.getByText("groq · 0 mensajes")).toBeInTheDocument();

    await typeAndSend("¿Por qué pierdo?");

    expect(screen.getByText("¿Por qué pierdo?")).toBeInTheDocument();
    expect(screen.getByText("Farmea mejor.")).toBeInTheDocument();
    expect(screen.getByText("groq · 2 mensajes")).toBeInTheDocument();
    expect(createConversation).toHaveBeenCalledWith("¿Por qué pierdo?");
    expect(appendMessage).toHaveBeenNthCalledWith(1, 7, "user", "¿Por qué pierdo?");
    expect(appendMessage).toHaveBeenNthCalledWith(2, 7, "assistant", "Farmea mejor.");
    // Input cleared after send; the empty-state ideas are gone.
    expect(input()).toHaveValue("");
    expect(screen.queryByText("Ideas para empezar")).not.toBeInTheDocument();
  });

  it("reuses the same conversation id for follow-up messages", async () => {
    vi.mocked(chatWithCoach)
      .mockResolvedValueOnce("R1")
      .mockResolvedValueOnce("R2");
    await renderView();
    await typeAndSend("uno");
    await typeAndSend("dos");

    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(appendMessage).toHaveBeenCalledWith(7, "user", "dos");
    expect(appendMessage).toHaveBeenCalledWith(7, "assistant", "R2");
    // Second call carries the full history.
    expect(vi.mocked(chatWithCoach).mock.calls[1][2]).toEqual([
      { role: "user", content: "uno" },
      { role: "assistant", content: "R1" },
      { role: "user", content: "dos" },
    ]);
  });

  it("shows the loading state while the reply is pending and blocks double sends", async () => {
    const d = deferred<string>();
    vi.mocked(chatWithCoach).mockReturnValue(d.promise);
    await renderView();
    await typeAndSend("pregunta");

    const box = screen.getByPlaceholderText("Esperando respuesta...");
    expect(box).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    // A non-blank submit while loading is ignored (only the `loading` guard
    // stops it: the text is non-empty and the context is loaded).
    fireEvent.change(box, { target: { value: "otra" } });
    expect(box).toHaveValue("otra");
    await act(async () => {
      fireEvent.submit(box.closest("form")!);
    });
    expect(chatWithCoach).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("otra")).not.toBeInTheDocument();

    await act(async () => {
      d.resolve("listo");
    });
    expect(screen.getByText("listo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escribe tu pregunta...")).not.toBeDisabled();
  });

  it("surfaces a chat error in the banner", async () => {
    vi.mocked(chatWithCoach).mockRejectedValue(new Error("rate limited"));
    await renderView();
    await typeAndSend("hola");
    expect(screen.getByText("⚠ Error: rate limited")).toBeInTheDocument();
    // The user message stays; no assistant message persisted.
    expect(screen.getByText("hola")).toBeInTheDocument();
    expect(appendMessage).not.toHaveBeenCalledWith(7, "assistant", expect.anything());
  });

  it("keeps chatting when persistence fails", async () => {
    vi.mocked(createConversation).mockRejectedValue(new Error("db locked"));
    vi.mocked(appendMessage).mockRejectedValue(new Error("db locked"));
    await renderView();
    await typeAndSend("hola");
    expect(screen.getByText("Farmea mejor.")).toBeInTheDocument();
    expect(screen.queryByText(/db locked/)).not.toBeInTheDocument();
  });

  it("creates a new conversation each time when createConversation returns 0 (non-Tauri)", async () => {
    vi.mocked(createConversation).mockResolvedValue(0);
    await renderView();
    await typeAndSend("uno");
    await typeAndSend("dos");
    expect(createConversation).toHaveBeenCalledTimes(2);
    expect(appendMessage).toHaveBeenCalledWith(0, "user", "dos");
  });

  it("disables send for blank input and ignores a blank submit", async () => {
    await renderView();
    fireEvent.change(input(), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await act(async () => {
      fireEvent.submit(input().closest("form")!);
    });
    expect(chatWithCoach).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("ignores sends until the context has loaded", async () => {
    vi.mocked(lcuRank).mockReturnValue(new Promise(() => {}));
    await renderView();
    await typeAndSend("pronto");
    expect(chatWithCoach).not.toHaveBeenCalled();
    expect(screen.queryByText("pronto")).not.toBeInTheDocument();
  });

  it("sends the translated suggested prompt when clicked", async () => {
    await renderView();
    expect(screen.getByText("Pregúntame lo que quieras sobre tu juego")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Analiza mis últimas 10 partidas/ }));
    });
    expect(vi.mocked(chatWithCoach).mock.calls[0][2]).toEqual([
      { role: "user", content: "Analiza mis últimas 10 partidas" },
    ]);
  });
});

describe("AiChatView — API key per provider", () => {
  it("without a key shows the hint and an error on send, never calling the API", async () => {
    setPrefs({ aiProvider: "groq", groqApiKey: "", riotProxyUrl: "" });
    await renderView();
    expect(
      screen.getByText("⚠ Necesitas una API key (groq) en Prefs. Groq es gratis.")
    ).toBeInTheDocument();

    await typeAndSend("hola");
    expect(
      screen.getByText("⚠ Configura tu API key (groq) en Prefs primero.")
    ).toBeInTheDocument();
    expect(chatWithCoach).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("groq without a key works through the proxy (default user)", async () => {
    setPrefs({ aiProvider: "groq", groqApiKey: "", riotProxyUrl: "https://proxy.test" });
    await renderView();
    expect(screen.queryByText(/Necesitas una API key/)).not.toBeInTheDocument();
    await typeAndSend("hola");
    expect(vi.mocked(chatWithCoach).mock.calls[0].slice(0, 2)).toEqual(["groq", ""]);
    expect(screen.getByText("Farmea mejor.")).toBeInTheDocument();
  });

  it("the proxy does not unlock a keyless gemini", async () => {
    setPrefs({ aiProvider: "gemini", geminiApiKey: "", riotProxyUrl: "https://proxy.test" });
    await renderView();
    await typeAndSend("hola");
    expect(chatWithCoach).not.toHaveBeenCalled();
  });

  it("uses the gemini key when gemini is selected", async () => {
    setPrefs({ aiProvider: "gemini", geminiApiKey: "gem-key", groqApiKey: "other" });
    await renderView();
    await typeAndSend("hola");
    expect(vi.mocked(chatWithCoach).mock.calls[0].slice(0, 2)).toEqual(["gemini", "gem-key"]);
  });

  it("uses the anthropic key when anthropic is selected", async () => {
    setPrefs({ aiProvider: "anthropic", anthropicApiKey: "sk-ant", groqApiKey: "other" });
    await renderView();
    await typeAndSend("hola");
    expect(vi.mocked(chatWithCoach).mock.calls[0].slice(0, 2)).toEqual(["anthropic", "sk-ant"]);
  });

  it("clears a previous error on the next successful send", async () => {
    vi.mocked(chatWithCoach)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    await renderView();
    await typeAndSend("uno");
    expect(screen.getByText("⚠ Error: boom")).toBeInTheDocument();
    await typeAndSend("dos");
    expect(screen.queryByText("⚠ Error: boom")).not.toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});

describe("AiChatView — history browser", () => {
  const NOW = new Date("2026-10-29T12:00:00Z").getTime();
  const OLD = NOW - 10 * 86_400_000;
  const CONVOS: ConversationMeta[] = [
    { id: 1, title: "Recién", updatedTsMs: NOW - 5_000 },
    { id: 2, title: "Minutos", updatedTsMs: NOW - 5 * 60_000 },
    { id: 3, title: "Horas", updatedTsMs: NOW - 3 * 3_600_000 },
    { id: 4, title: "Días", updatedTsMs: NOW - 2 * 86_400_000 },
    { id: 5, title: "Viejo", updatedTsMs: OLD },
  ];

  async function openHistory() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Historial/ }));
    });
  }

  it("lists conversations with relative timestamps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.mocked(listConversations).mockResolvedValue(CONVOS);
    vi.mocked(searchConversations).mockResolvedValue(CONVOS);
    await renderView();
    await openHistory();

    expect(listConversations).toHaveBeenCalled();
    expect(searchConversations).toHaveBeenCalledWith("");
    expect(screen.getByText("Recién")).toBeInTheDocument();
    expect(screen.getByText("ahora")).toBeInTheDocument();
    expect(screen.getByText("hace 5 min")).toBeInTheDocument();
    expect(screen.getByText("hace 3 h")).toBeInTheDocument();
    expect(screen.getByText("hace 2 d")).toBeInTheDocument();
    expect(screen.getByText(new Date(OLD).toLocaleDateString())).toBeInTheDocument();
    // Chat input is hidden while browsing.
    expect(screen.queryByPlaceholderText("Escribe tu pregunta...")).not.toBeInTheDocument();
  });

  it("shows the empty state, and 'no results' once a term is typed", async () => {
    await renderView();
    await openHistory();
    expect(screen.getByText("Aún no hay conversaciones guardadas.")).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Buscar en tus conversaciones…"), {
        target: { value: "yasuo" },
      });
    });
    expect(searchConversations).toHaveBeenLastCalledWith("yasuo");
    expect(screen.getByText("Sin resultados.")).toBeInTheDocument();
  });

  it("discards a stale search result that resolves after a newer one", async () => {
    const first = deferred<ConversationMeta[]>();
    vi.mocked(searchConversations)
      .mockReturnValueOnce(first.promise) // "" on open
      .mockResolvedValueOnce([{ id: 9, title: "Nuevo", updatedTsMs: Date.now() }]);
    await renderView();
    await openHistory();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Buscar en tus conversaciones…"), {
        target: { value: "nu" },
      });
    });
    expect(screen.getByText("Nuevo")).toBeInTheDocument();

    await act(async () => {
      first.resolve([{ id: 8, title: "Obsoleto", updatedTsMs: Date.now() }]);
    });
    expect(screen.queryByText("Obsoleto")).not.toBeInTheDocument();
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
  });

  it("resumes a saved conversation and appends to it", async () => {
    const convo = [{ id: 3, title: "Plan semanal", updatedTsMs: Date.now() }];
    vi.mocked(searchConversations).mockResolvedValue(convo);
    vi.mocked(loadMessages).mockResolvedValue([
      { role: "user", content: "pregunta vieja" },
      { role: "assistant", content: "respuesta vieja" },
    ]);
    await renderView();
    await openHistory();
    await act(async () => {
      fireEvent.click(screen.getByText("Plan semanal"));
    });

    expect(loadMessages).toHaveBeenCalledWith(3);
    expect(screen.getByText("respuesta vieja")).toBeInTheDocument();
    expect(screen.getByText("groq · 2 mensajes")).toBeInTheDocument();

    await typeAndSend("seguimos");
    expect(createConversation).not.toHaveBeenCalled();
    expect(appendMessage).toHaveBeenCalledWith(3, "user", "seguimos");
    expect(vi.mocked(chatWithCoach).mock.calls[0][2]).toHaveLength(3);
  });

  it("deletes a conversation and refreshes the list with the current term", async () => {
    const row = [{ id: 4, title: "Borrable", updatedTsMs: Date.now() }];
    vi.mocked(searchConversations)
      .mockResolvedValueOnce(row) // "" on open
      .mockResolvedValueOnce(row) // "borr"
      .mockResolvedValue([]);
    await renderView();
    await openHistory();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Buscar en tus conversaciones…"), {
        target: { value: "borr" },
      });
    });
    expect(screen.getByText("Borrable")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Borrar conversación" }));
    });
    expect(deleteConversation).toHaveBeenCalledWith(4);
    // Refresh uses the typed term, not a blank list query.
    expect(searchConversations).toHaveBeenLastCalledWith("borr");
    expect(searchConversations).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("Borrable")).not.toBeInTheDocument();
    // Still browsing history (deleted conv was not the open one).
    expect(screen.getByText("Sin resultados.")).toBeInTheDocument();
  });

  it("deleting the open conversation resets to a fresh chat", async () => {
    await renderView();
    await typeAndSend("activo"); // creates conv 7
    vi.mocked(searchConversations).mockResolvedValueOnce([
      { id: 7, title: "activo", updatedTsMs: Date.now() },
    ]);
    await openHistory();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Borrar conversación" }));
    });
    expect(deleteConversation).toHaveBeenCalledWith(7);
    // Back in chat view with the empty state.
    expect(screen.getByText("Ideas para empezar")).toBeInTheDocument();
    expect(screen.getByText("groq · 0 mensajes")).toBeInTheDocument();
  });
});

describe("AiChatView — switching conversation mid-request", () => {
  it("'Nueva' while a reply is pending: the late reply is saved under its own chat, not shown", async () => {
    const d = deferred<string>();
    vi.mocked(chatWithCoach).mockReturnValue(d.promise);
    await renderView();
    await typeAndSend("pregunta");
    fireEvent.click(screen.getByRole("button", { name: /Nueva/ }));
    expect(screen.getByText("Ideas para empezar")).toBeInTheDocument();
    // The new chat is usable right away.
    expect(screen.getByPlaceholderText(/Escribe tu pregunta/)).not.toBeDisabled();

    await act(async () => {
      d.resolve("respuesta tardía");
    });
    expect(screen.queryByText("respuesta tardía")).not.toBeInTheDocument();
    expect(screen.getByText("Ideas para empezar")).toBeInTheDocument();
    expect(appendMessage).toHaveBeenCalledWith(7, "assistant", "respuesta tardía");

    // The next message opens a new conversation with a clean history.
    vi.mocked(chatWithCoach).mockResolvedValue("ok");
    vi.mocked(createConversation).mockResolvedValue(8);
    await typeAndSend("otra");
    expect(appendMessage).toHaveBeenCalledWith(8, "user", "otra");
    expect(vi.mocked(chatWithCoach).mock.calls[1][2]).toEqual([{ role: "user", content: "otra" }]);
  });

  it("'Nueva' while the conversation is still being created does not bring the old id back", async () => {
    const c = deferred<number>();
    vi.mocked(createConversation).mockReturnValueOnce(c.promise);
    await renderView();
    await typeAndSend("pregunta");
    fireEvent.click(screen.getByRole("button", { name: /Nueva/ }));
    await act(async () => {
      c.resolve(7);
    });
    vi.mocked(createConversation).mockResolvedValue(8);
    await typeAndSend("otra");
    expect(createConversation).toHaveBeenCalledTimes(2);
    expect(appendMessage).toHaveBeenCalledWith(8, "user", "otra");
  });

  it("resuming another chat while a reply is pending keeps that chat clean", async () => {
    const d = deferred<string>();
    vi.mocked(chatWithCoach).mockReturnValue(d.promise);
    vi.mocked(searchConversations).mockResolvedValue([
      { id: 3, title: "Plan semanal", updatedTsMs: Date.now() },
    ]);
    vi.mocked(loadMessages).mockResolvedValue([
      { role: "user", content: "pregunta vieja" },
      { role: "assistant", content: "respuesta vieja" },
    ]);
    await renderView();
    await typeAndSend("pregunta");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Historial/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Plan semanal"));
    });
    await act(async () => {
      d.resolve("respuesta tardía");
    });
    expect(screen.getByText("respuesta vieja")).toBeInTheDocument();
    expect(screen.queryByText("respuesta tardía")).not.toBeInTheDocument();
    expect(appendMessage).toHaveBeenCalledWith(7, "assistant", "respuesta tardía");
    expect(appendMessage).not.toHaveBeenCalledWith(3, "assistant", "respuesta tardía");
  });
});

describe("AiChatView — new chat + closing", () => {
  it("'Nueva' is disabled on an empty chat and resets an active one", async () => {
    await renderView();
    const newBtn = screen.getByRole("button", { name: /Nueva/ });
    expect(newBtn).toBeDisabled();

    await typeAndSend("hola");
    expect(newBtn).not.toBeDisabled();
    fireEvent.click(newBtn);
    expect(screen.queryByText("hola")).not.toBeInTheDocument();
    expect(screen.getByText("Ideas para empezar")).toBeInTheDocument();
    expect(newBtn).toBeDisabled();

    // Next message opens a brand-new conversation.
    await typeAndSend("otra");
    expect(createConversation).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape and backdrop click, not on inner clicks", async () => {
    const { onClose } = await renderView();
    fireEvent.click(screen.getByText("AI Coach"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("AiChatView — a11y wiring", () => {
  it("labels the dialog and exposes the conversation log", async () => {
    await renderView();
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "AI Coach" })).toBeInTheDocument()
    );
    expect(screen.getByRole("log", { name: "Conversación con el coach AI" })).toBeInTheDocument();
  });
});
