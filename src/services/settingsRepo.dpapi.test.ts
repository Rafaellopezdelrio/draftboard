import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const selectMock = vi.fn();
const executeMock = vi.fn();
vi.mock("../db/client", () => ({
  isTauri: () => true,
  getDb: async () => ({ select: selectMock, execute: executeMock }),
}));

import { loadSettings, saveSettings } from "./settingsRepo";

const row = (api_key: string) => [
  { api_key, region: "euw1", riot_id_name: "Name", riot_id_tag: "EUW", puuid: null },
];

beforeEach(() => {
  invokeMock.mockReset();
  selectMock.mockReset();
  executeMock.mockReset().mockResolvedValue({});
});

describe("Riot key encryption at rest", () => {
  it("encrypts a key an older version saved in plaintext, and still returns it", async () => {
    selectMock.mockResolvedValue(row("RGAPI-plain"));
    invokeMock.mockImplementation(async (cmd: unknown) => (cmd === "dpapi_protect" ? "RU5D" : ""));

    const s = await loadSettings();

    expect(s?.apiKey).toBe("RGAPI-plain");
    expect(executeMock).toHaveBeenCalledWith("UPDATE riot_config SET api_key = $1 WHERE id = 1", ["dpapi:RU5D"]);
  });

  it("decrypts a stored key without writing", async () => {
    selectMock.mockResolvedValue(row("dpapi:RU5D"));
    invokeMock.mockResolvedValue("RGAPI-secret");

    expect((await loadSettings())?.apiKey).toBe("RGAPI-secret");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("leaves an empty key empty", async () => {
    selectMock.mockResolvedValue(row(""));
    expect((await loadSettings())?.apiKey).toBe("");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("saves the key encrypted", async () => {
    invokeMock.mockResolvedValue("RU5D");
    await saveSettings({ apiKey: " RGAPI-new\n", region: "euw1", riotIdName: "N", riotIdTag: "T" });
    expect(invokeMock).toHaveBeenCalledWith("dpapi_protect", { plaintext: "RGAPI-new" });
    expect(executeMock.mock.calls[0][1][0]).toBe("dpapi:RU5D");
  });
});
