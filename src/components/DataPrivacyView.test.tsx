// DataPrivacyView contract:
//   - Shows the stored-match count and the rolling auto-backup list (or the
//     empty hint) loaded on mount.
//   - Full JSON export bundles matches + a REDACTED prefs envelope.
//   - Prefs export/import go through the Tauri dialog + fs plugins; secrets
//     are redacted unless explicitly requested; import applies the safe
//     subset to the store and reports ignored keys.
//   - DB backup / restore surface success + error toasts; restore always
//     goes through a ConfirmDialog and offers a "restart now" action.
//   - Destructive actions (clear matches, reset prefs) require confirmation.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { DataPrivacyView } from "./DataPrivacyView";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import { REDACTED_PLACEHOLDER } from "../services/prefsExport";
import type { MatchRow } from "../services/matchRepo";
import type { AutoBackupEntry } from "../services/dbBackup";

const { toastPush } = vi.hoisted(() => ({ toastPush: vi.fn() }));

vi.mock("./ui/ToastContainer", () => ({
  useToast: () => ({ push: toastPush, dismiss: vi.fn(), dismissAll: vi.fn() }),
}));

vi.mock("../services/matchRepo", () => ({
  recentMatches: vi.fn(),
  clearAllMatches: vi.fn(),
}));

vi.mock("../services/dbBackup", () => ({
  backupDatabase: vi.fn(),
  listAutoBackups: vi.fn(),
  restoreFromPath: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { recentMatches, clearAllMatches } from "../services/matchRepo";
import { backupDatabase, listAutoBackups, restoreFromPath } from "../services/dbBackup";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { isTauri } from "../db/client";

const MATCHES = [{ matchId: "a" }, { matchId: "b" }, { matchId: "c" }] as unknown as MatchRow[];

const BACKUPS: AutoBackupEntry[] = [
  { path: "C:\\data\\backups\\auto-2026-10-26.db", dateLabel: "2026-10-26", sizeBytes: 5120, modifiedSecs: 1 },
  { path: "C:\\data\\backups\\auto-2026-10-25.db", dateLabel: "2026-10-25", sizeBytes: 1536, modifiedSecs: 0 },
];

function setPrefs(over: Partial<Preferences> = {}) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

function btn(name: RegExp | string) {
  return screen.getByRole("button", { name });
}

/** Last toast pushed. */
function lastToast() {
  const calls = toastPush.mock.calls;
  return calls[calls.length - 1]?.[0];
}

async function renderView(onClose = vi.fn()) {
  const utils = render(<DataPrivacyView onClose={onClose} />);
  await act(async () => {});
  return { ...utils, onClose };
}

beforeEach(() => {
  setPrefs();
  toastPush.mockReset();
  vi.mocked(recentMatches).mockReset().mockResolvedValue(MATCHES);
  vi.mocked(clearAllMatches).mockReset().mockResolvedValue(undefined);
  vi.mocked(listAutoBackups).mockReset().mockResolvedValue([]);
  vi.mocked(backupDatabase).mockReset();
  vi.mocked(restoreFromPath).mockReset();
  vi.mocked(open).mockReset();
  vi.mocked(save).mockReset();
  vi.mocked(writeTextFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(readTextFile).mockReset();
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
});

// No vi.restoreAllMocks(): it would also wipe setup.ts's plugin-sql mock
// implementation that the prefs store persists through.
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataPrivacyView — overview", () => {
  it("shows the stored match count loaded on mount", async () => {
    await renderView();
    expect(recentMatches).toHaveBeenCalledWith(1000);
    expect(screen.getByText("3").closest("li")).toHaveTextContent(
      "3 partidas (KDA, CS, campeón, queue)"
    );
  });

  it("shows the empty hint when there are no auto-backups", async () => {
    await renderView();
    expect(screen.getByText(/Aún no hay snapshots/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restaurar" })).toBeNull();
  });

  it("lists auto-backups with date and size, and restore asks for confirmation", async () => {
    vi.mocked(listAutoBackups).mockResolvedValue(BACKUPS);
    vi.mocked(restoreFromPath).mockResolvedValue(4096);
    await renderView();
    expect(screen.getByText("2026-10-26")).toBeInTheDocument();
    expect(screen.getByText("5.0 KB")).toBeInTheDocument();
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Restaurar" })[1]);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("auto-2026-10-25.db");
    // The dialog's confirm button also reads "Restaurar" — it's the last one.
    const restoreButtons = screen.getAllByRole("button", { name: "Restaurar" });
    await act(async () => {
      fireEvent.click(restoreButtons[restoreButtons.length - 1]);
    });
    expect(restoreFromPath).toHaveBeenCalledWith(BACKUPS[1].path);
  });

  it("closes on backdrop click and Escape, not on clicks inside", async () => {
    const { onClose } = await renderView();
    fireEvent.click(screen.getByRole("heading", { name: /Tus datos/ }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("DataPrivacyView — full JSON export", () => {
  it("downloads matches plus a redacted prefs envelope", async () => {
    setPrefs({ groqApiKey: "gsk_real_secret", compactMode: true });
    let blob: Blob | undefined;
    const createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:export";
    });
    const revokeObjectURL = vi.fn();
    // jsdom has no object URLs; swap them in for this test only.
    const orig = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    let anchor: HTMLAnchorElement | undefined;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        anchor = this;
      });

    try {
      await renderView();
      await act(async () => {
        fireEvent.click(btn(/Exportar todos mis datos/));
      });
    } finally {
      URL.createObjectURL = orig.create;
      URL.revokeObjectURL = orig.revoke;
      clickSpy.mockRestore();
    }

    expect(anchor?.download).toMatch(/^lol-draft-advisor-export-\d+\.json$/);
    expect(anchor?.href).toBe("blob:export");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
    expect(blob?.type).toBe("application/json");
    const text = await blob!.text();
    expect(text).not.toContain("gsk_real_secret");
    const data = JSON.parse(text);
    expect(data.matches).toEqual(MATCHES);
    expect(data.preferences.app).toBe("draftboard");
    expect(data.preferences.prefs.groqApiKey).toBe(REDACTED_PLACEHOLDER);
    expect(data.preferences.prefs.compactMode).toBe(true);
    expect(typeof data.exportedAt).toBe("string");
  });
});

describe("DataPrivacyView — prefs export", () => {
  it("writes redacted prefs to the chosen file by default", async () => {
    setPrefs({ groqApiKey: "gsk_real_secret" });
    vi.mocked(save).mockResolvedValue("C:\\Users\\me\\prefs-out.json");
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/claves redactadas/));
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: expect.stringMatching(/^draftboard-prefs-\d{4}-\d{2}-\d{2}\.json$/) })
    );
    const [target, json] = vi.mocked(writeTextFile).mock.calls[0];
    expect(target).toBe("C:\\Users\\me\\prefs-out.json");
    expect(JSON.parse(json as string).prefs.groqApiKey).toBe(REDACTED_PLACEHOLDER);
    expect(lastToast()).toMatchObject({
      type: "success",
      title: "Preferencias exportadas (claves redactadas)",
      detail: "prefs-out.json",
    });
  });

  it("includes real secrets only when exporting WITH keys", async () => {
    setPrefs({ groqApiKey: "gsk_real_secret" });
    vi.mocked(save).mockResolvedValue("/home/me/prefs.json");
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/CON claves/));
    });
    const json = vi.mocked(writeTextFile).mock.calls[0][1] as string;
    expect(JSON.parse(json).prefs.groqApiKey).toBe("gsk_real_secret");
    expect(lastToast()).toMatchObject({ title: "Preferencias exportadas (con claves)", detail: "prefs.json" });
  });

  it("does nothing when the save dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/claves redactadas/));
    });
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(toastPush).not.toHaveBeenCalled();
    expect(btn(/claves redactadas/)).not.toBeDisabled();
  });

  it("reports write failures as an error toast", async () => {
    vi.mocked(save).mockResolvedValue("/x/p.json");
    vi.mocked(writeTextFile).mockRejectedValue(new Error("disk full"));
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/claves redactadas/));
    });
    expect(lastToast()).toEqual({ type: "error", title: "No se pudo exportar", detail: "Error: disk full" });
  });
});

describe("DataPrivacyView — prefs import", () => {
  it("applies the valid subset to the store and lists ignored keys", async () => {
    vi.mocked(open).mockResolvedValue("/x/prefs.json");
    vi.mocked(readTextFile).mockResolvedValue(
      JSON.stringify({
        app: "draftboard",
        schemaVersion: 1,
        prefs: {
          compactMode: true,
          aiCoachLanguage: "en",
          groqApiKey: REDACTED_PLACEHOLDER,
          bogus: 1,
          safeMode: "yes",
          termsAcceptedAt: 5,
        },
      })
    );
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Importar preferencias/));
    });

    expect(readTextFile).toHaveBeenCalledWith("/x/prefs.json");
    const p = usePrefsStore.getState().prefs;
    expect(p.compactMode).toBe(true);
    expect(p.aiCoachLanguage).toBe("en");
    expect(p.safeMode).toBe(false);
    expect(p.termsAcceptedAt).toBeNull();
    expect(lastToast()).toEqual({
      type: "success",
      title: "Importadas 2 preferencias",
      detail:
        "4 ignoradas: groqApiKey (redactada), bogus (desconocida), safeMode (tipo incorrecto)…",
      durationMs: 8000,
    });
  });

  it("lists up to 3 ignored keys without an ellipsis", async () => {
    vi.mocked(open).mockResolvedValue("/x/prefs.json");
    vi.mocked(readTextFile).mockResolvedValue(
      JSON.stringify({
        app: "draftboard",
        schemaVersion: 1,
        prefs: { compactMode: true, bogus: 1, termsAcceptedAt: 5 },
      })
    );
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Importar preferencias/));
    });
    expect(lastToast()).toMatchObject({
      title: "Importadas 1 preferencias",
      detail: "2 ignoradas: bogus (desconocida), termsAcceptedAt (no importable)",
    });
  });

  it("omits the ignored detail when every key applied", async () => {
    vi.mocked(open).mockResolvedValue("/x/prefs.json");
    vi.mocked(readTextFile).mockResolvedValue(
      JSON.stringify({ app: "draftboard", schemaVersion: 1, prefs: { liveTimer: false } })
    );
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Importar preferencias/));
    });
    expect(usePrefsStore.getState().prefs.liveTimer).toBe(false);
    expect(lastToast()).toMatchObject({ title: "Importadas 1 preferencias", detail: undefined });
  });

  it("rejects an invalid file without touching prefs", async () => {
    vi.mocked(open).mockResolvedValue("/x/garbage.json");
    vi.mocked(readTextFile).mockResolvedValue("{ not json");
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Importar preferencias/));
    });
    expect(lastToast()).toMatchObject({ type: "error", title: "Archivo inválido" });
    expect(lastToast().detail).toMatch(/^JSON inválido/);
    expect(usePrefsStore.getState().prefs).toEqual(DEFAULT_PREFS);
  });

  it("does nothing when the open dialog is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Importar preferencias/));
    });
    expect(readTextFile).not.toHaveBeenCalled();
    expect(toastPush).not.toHaveBeenCalled();
  });

  it("reports read failures as an error toast", async () => {
    vi.mocked(open).mockResolvedValue("/x/prefs.json");
    vi.mocked(readTextFile).mockRejectedValue(new Error("EACCES"));
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Importar preferencias/));
    });
    expect(lastToast()).toEqual({ type: "error", title: "No se pudo importar", detail: "Error: EACCES" });
  });
});

describe("DataPrivacyView — DB backup", () => {
  it("toasts size + file name on success and disables actions while busy", async () => {
    let resolve!: (v: { path: string; bytes: number }) => void;
    vi.mocked(backupDatabase).mockReturnValue(new Promise((r) => (resolve = r)));
    await renderView();
    fireEvent.click(btn(/Guardar backup de la base de datos/));
    expect(btn(/Guardar backup de la base de datos/)).toBeDisabled();
    expect(btn(/Importar preferencias/)).toBeDisabled();

    await act(async () => {
      resolve({ path: "C:\\Users\\me\\draftboard-backup.db", bytes: 2048 });
    });
    expect(lastToast()).toEqual({
      type: "success",
      title: "Backup guardado",
      detail: "2.0 KB en draftboard-backup.db",
    });
    expect(btn(/Guardar backup de la base de datos/)).not.toBeDisabled();
  });

  it("stays silent when the user cancels the save dialog", async () => {
    vi.mocked(backupDatabase).mockResolvedValue({ path: "", bytes: 0 });
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Guardar backup de la base de datos/));
    });
    expect(toastPush).not.toHaveBeenCalled();
  });

  it("reports backup errors", async () => {
    vi.mocked(backupDatabase).mockRejectedValue(new Error("locked"));
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Guardar backup de la base de datos/));
    });
    expect(lastToast()).toEqual({ type: "error", title: "Error al hacer backup", detail: "Error: locked" });
  });
});

describe("DataPrivacyView — DB restore", () => {
  it("picks a file, confirms, restores and offers a restart action", async () => {
    vi.mocked(open).mockResolvedValue("C:\\backups\\old.db");
    vi.mocked(restoreFromPath).mockResolvedValue(10240);
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Restaurar desde backup/));
    });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        filters: [{ name: "SQLite DB", extensions: ["db", "sqlite", "sqlite3"] }],
      })
    );
    expect(restoreFromPath).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("old.db");

    await act(async () => {
      fireEvent.click(btn("Restaurar"));
    });
    expect(restoreFromPath).toHaveBeenCalledWith("C:\\backups\\old.db");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Backup list is refreshed after the restore.
    expect(listAutoBackups).toHaveBeenCalledTimes(2);

    const toast = lastToast();
    expect(toast).toMatchObject({
      type: "success",
      title: "DB restaurada",
      detail: "10.0 KB. Reiniciamos para aplicar.",
      durationMs: 10000,
    });
    expect(toast.action.label).toBe("Reiniciar ahora");
    await toast.action.onClick();
    expect(invoke).toHaveBeenCalledWith("restart_app");
  });

  it("swallows a failing restart invoke (manual restart fallback)", async () => {
    vi.mocked(open).mockResolvedValue("/b/old.db");
    vi.mocked(restoreFromPath).mockResolvedValue(1024);
    vi.mocked(invoke).mockRejectedValue(new Error("no tauri"));
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Restaurar desde backup/));
    });
    await act(async () => {
      fireEvent.click(btn("Restaurar"));
    });
    await expect(lastToast().action.onClick()).resolves.toBeUndefined();
  });

  it("reports restore errors truncated to 200 chars and closes the dialog", async () => {
    vi.mocked(open).mockResolvedValue("/b/bad.db");
    vi.mocked(restoreFromPath).mockRejectedValue(new Error("x".repeat(500)));
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Restaurar desde backup/));
    });
    await act(async () => {
      fireEvent.click(btn("Restaurar"));
    });
    const toast = lastToast();
    expect(toast).toMatchObject({ type: "error", title: "No se pudo restaurar" });
    expect(toast.detail).toHaveLength(200);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("cancelled or multi-select picks never open the confirm dialog", async () => {
    vi.mocked(open).mockResolvedValueOnce(null).mockResolvedValueOnce(["/a.db", "/b.db"]);
    await renderView();
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.click(btn(/Restaurar desde backup/));
      });
      expect(screen.queryByRole("alertdialog")).toBeNull();
    }
    expect(toastPush).not.toHaveBeenCalled();
  });

  it("reports dialog failures", async () => {
    vi.mocked(open).mockRejectedValue(new Error("dialog crashed"));
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Restaurar desde backup/));
    });
    expect(lastToast()).toEqual({ type: "error", title: "Error", detail: "Error: dialog crashed" });
  });

  it("cancelling the restore confirmation does not restore", async () => {
    vi.mocked(open).mockResolvedValue("/b/old.db");
    await renderView();
    await act(async () => {
      fireEvent.click(btn(/Restaurar desde backup/));
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[1]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(restoreFromPath).not.toHaveBeenCalled();
  });
});

describe("DataPrivacyView — destructive actions", () => {
  it("clearing matches requires confirmation and resets the counter", async () => {
    await renderView();
    fireEvent.click(btn(/Borrar todas mis partidas/));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Vas a borrar 3 partidas");
    expect(clearAllMatches).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(btn("Borrar todo"));
    });
    expect(clearAllMatches).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("0").closest("li")).toHaveTextContent("0 partidas");
  });

  it("cancelling the clear keeps the matches", async () => {
    await renderView();
    fireEvent.click(btn(/Borrar todas mis partidas/));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[1]);
    expect(clearAllMatches).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  // In the desktop app (isTauri() true) prefsStore persists to the SQLite
  // `preferences` table, so the reset must wipe those rows BEFORE reloading
  // or every pref comes back unchanged.
  it("reset prefs deletes the persisted SQLite prefs in the desktop app before reloading", async () => {
    // setup.ts defines __TAURI_INTERNALS__, so the store runs its desktop
    // (SQLite) path against the mocked plugin-sql handle.
    expect(isTauri()).toBe(true);
    const db = await Database.load("sqlite:lol-draft-advisor.db");
    const execute = vi.mocked(db.execute);
    execute.mockClear(); // keeps setup.ts's implementation
    const reload = vi.fn();
    vi.stubGlobal("localStorage", { removeItem: vi.fn(), getItem: vi.fn(), setItem: vi.fn() });
    vi.stubGlobal("location", { reload });
    await renderView();
    fireEvent.click(btn(/Restablecer todas las preferencias/));
    await act(async () => {
      fireEvent.click(btn("Restablecer"));
    });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    const deleteIdx = execute.mock.calls.findIndex(([sql]) => /DELETE FROM preferences/i.test(String(sql)));
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(execute.mock.invocationCallOrder[deleteIdx]).toBeLessThan(reload.mock.invocationCallOrder[0]);
  });

  it("reset prefs wipes the browser-mode localStorage blob and reloads after confirmation", async () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__TAURI_INTERNALS__;
    try {
      expect(isTauri()).toBe(false);
      const removeItem = vi.fn();
      const reload = vi.fn();
      vi.stubGlobal("localStorage", { removeItem, getItem: vi.fn(), setItem: vi.fn() });
      vi.stubGlobal("location", { reload });
      await renderView();
      fireEvent.click(btn(/Restablecer todas las preferencias/));
      expect(screen.getByRole("alertdialog")).toHaveTextContent("¿Restablecer todas las preferencias?");
      expect(removeItem).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.click(btn("Restablecer"));
      });
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(removeItem).toHaveBeenCalledWith("lol-draft-prefs");
      expect(removeItem.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
    } finally {
      Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
        value: undefined,
        writable: true,
        configurable: true,
      });
    }
  });

  it("reports a failed prefs reset, closes the dialog and does not reload", async () => {
    const db = await Database.load("sqlite:lol-draft-advisor.db");
    const execute = vi.mocked(db.execute);
    execute.mockImplementationOnce(async () => {
      throw new Error("db locked");
    });
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    const onUnhandled = vi.fn();
    process.on("unhandledRejection", onUnhandled);
    try {
      await renderView();
      fireEvent.click(btn(/Restablecer todas las preferencias/));
      await act(async () => {
        fireEvent.click(btn("Restablecer"));
      });
      await waitFor(() => expect(lastToast()).toMatchObject({ type: "error", title: "Error" }));
      expect(lastToast().detail).toContain("db locked");
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(reload).not.toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 0));
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("cancelling the prefs reset leaves storage alone", async () => {
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", { removeItem });
    await renderView();
    fireEvent.click(btn(/Restablecer todas las preferencias/));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[1]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(removeItem).not.toHaveBeenCalled();
  });
});
