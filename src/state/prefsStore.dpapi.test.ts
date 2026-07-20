import { describe, it, expect, vi, beforeEach } from "vitest";

// The DPAPI at-rest seam lives in loadAll/persistOne; exercise it through the
// store's public API with the Tauri layer mocked.
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

import { usePrefsStore } from "./prefsStore";

const row = (key: string, value: unknown) => ({ key, value: JSON.stringify(value) });

describe("prefs BYO-key encryption at rest (DPAPI seam)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    selectMock.mockReset();
    executeMock.mockReset();
    executeMock.mockResolvedValue({});
  });

  it("decrypts dpapi:-prefixed keys on load and passes legacy plaintext through", async () => {
    selectMock.mockResolvedValue([
      row("groqApiKey", "dpapi:QkxPQg=="),
      row("geminiApiKey", "gsk_legacy_plain"), // pre-migration row
      row("showSuggestions", true),
    ]);
    invokeMock.mockImplementation(async (cmd: unknown) =>
      cmd === "dpapi_unprotect" ? "gsk_decrypted" : ""
    );

    await usePrefsStore.getState().load();
    const p = usePrefsStore.getState().prefs;
    expect(p.groqApiKey).toBe("gsk_decrypted");
    expect(p.geminiApiKey).toBe("gsk_legacy_plain");
    expect(invokeMock).toHaveBeenCalledWith("dpapi_unprotect", {
      ciphertextB64: "QkxPQg==",
    });
  });

  it("resets the key to empty when the blob can't be decrypted (fail closed)", async () => {
    selectMock.mockResolvedValue([row("groqApiKey", "dpapi:corrupt")]);
    invokeMock.mockRejectedValue(new Error("CryptUnprotectData: bad blob"));

    await usePrefsStore.getState().load();
    expect(usePrefsStore.getState().prefs.groqApiKey).toBe("");
  });

  it("encrypts a secret pref on save (dpapi: marker lands in the DB)", async () => {
    selectMock.mockResolvedValue([]);
    await usePrefsStore.getState().load();
    invokeMock.mockResolvedValue("RU5DUllQVEVE");

    await usePrefsStore.getState().set("groqApiKey", "gsk_new_secret");

    expect(invokeMock).toHaveBeenCalledWith("dpapi_protect", {
      plaintext: "gsk_new_secret",
    });
    const calls = executeMock.mock.calls;
    const [, params] = calls[calls.length - 1];
    expect(params[0]).toBe("groqApiKey");
    expect(JSON.parse(params[1])).toBe("dpapi:RU5DUllQVEVE");
  });

  it("does NOT encrypt non-secret prefs", async () => {
    selectMock.mockResolvedValue([]);
    await usePrefsStore.getState().load();

    await usePrefsStore.getState().set("showSuggestions", false);

    expect(invokeMock).not.toHaveBeenCalledWith("dpapi_protect", expect.anything());
    const calls = executeMock.mock.calls;
    const [, params] = calls[calls.length - 1];
    expect(JSON.parse(params[1])).toBe(false);
  });
});
