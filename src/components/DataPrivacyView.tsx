import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { recentMatches, clearAllMatches } from "../services/matchRepo";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";

const DATAPRIVACY_TITLE_ID = "dataprivacy-view-title";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import {
  backupDatabase,
  listAutoBackups,
  restoreFromPath,
  type AutoBackupEntry,
} from "../services/dbBackup";
import { useToast } from "./ui/ToastContainer";
import { exportPrefsToJson, importPrefs } from "../services/prefsExport";
import { usePrefsStore, type Preferences } from "../state/prefsStore";

interface Props {
  onClose: () => void;
}

export function DataPrivacyView({ onClose }: Props) {
  const [matchCount, setMatchCount] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearPrefs, setConfirmClearPrefs] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [autoBackups, setAutoBackups] = useState<AutoBackupEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const { push: toast } = useToast();
  const { t } = useTranslation();
  // Direct store handle so we can apply imported prefs key-by-key.
  // Using getState() (not the hook) keeps the import path framework-free
  // and lets us batch dozens of `set` calls without re-rendering between
  // each one.
  const prefs = usePrefsStore((s) => s.prefs);
  useEscape(onClose);

  // Load the rolling auto-backup list on mount + after every restore so the
  // user always sees the current state of disk.
  useEffect(() => {
    listAutoBackups().then(setAutoBackups);
  }, []);

  async function handleBackup() {
    setBusy(true);
    try {
      const r = await backupDatabase();
      if (r.path) {
        toast({
          type: "success",
          title: t("dataPrivacy.toast.backupSaved"),
          detail: t("dataPrivacy.toast.backupSavedDetail", {
            kb: (r.bytes / 1024).toFixed(1),
            file: r.path.split(/[\\/]/).pop(),
          }),
        });
      }
    } catch (e) {
      toast({ type: "error", title: t("dataPrivacy.toast.backupError"), detail: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleRestorePick() {
    setBusy(true);
    try {
      // Step 1: pick the file. We confirm BEFORE overwriting the current
      // DB so the user can review which file they're about to import.
      const { open } = await import("@tauri-apps/plugin-dialog");
      const source = await open({
        title: t("dataPrivacy.toast.pickBackup"),
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite DB", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (!source || Array.isArray(source)) return;
      setConfirmRestore(source);
    } catch (e) {
      toast({ type: "error", title: t("dataPrivacy.toast.error"), detail: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    if (!confirmRestore) return;
    setBusy(true);
    try {
      const bytes = await restoreFromPath(confirmRestore);
      toast({
        type: "success",
        title: t("dataPrivacy.toast.dbRestored"),
        detail: t("dataPrivacy.toast.dbRestoredDetail", {
          kb: (bytes / 1024).toFixed(1),
        }),
        durationMs: 10000,
        action: {
          label: t("dataPrivacy.toast.restartNow"),
          onClick: async () => {
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("restart_app");
            } catch {
              /* fall back to manual restart */
            }
          },
        },
      });
      // Refresh the auto-backup list — the previous current DB was just
      // archived as `.pre-restore` and the new file is in place.
      listAutoBackups().then(setAutoBackups);
    } catch (e) {
      toast({
        type: "error",
        title: t("dataPrivacy.toast.restoreError"),
        detail: String(e).slice(0, 200),
      });
    } finally {
      setBusy(false);
      setConfirmRestore(null);
    }
  }

  useEffect(() => {
    recentMatches(1000).then((m) => setMatchCount(m.length));
  }, []);

  async function exportAll() {
    // Privacy: route the prefs portion through exportPrefs so API keys
    // are redacted by default. The previous version dumped raw
    // localStorage which leaked Groq / Anthropic / Riot proxy values.
    const matches = await recentMatches(1000);
    const prefsEnvelope = JSON.parse(exportPrefsToJson(prefs));
    const data = {
      exportedAt: new Date().toISOString(),
      matches,
      preferences: prefsEnvelope,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lol-draft-advisor-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export prefs only (smaller, portable, editable). Uses the Tauri
  // save dialog so the user controls where the file lands.
  async function handleExportPrefs(includeSecrets: boolean) {
    setBusy(true);
    try {
      const json = exportPrefsToJson(prefs, { includeSecrets });
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const defaultName = `draftboard-prefs-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      const target = await save({
        title: t("dataPrivacy.toast.exportPrefsTitle"),
        defaultPath: defaultName,
        filters: [{ name: "Draftboard prefs", extensions: ["json"] }],
      });
      if (!target) return;
      await writeTextFile(target, json);
      toast({
        type: "success",
        title: includeSecrets
          ? t("dataPrivacy.toast.prefsExportedKeys")
          : t("dataPrivacy.toast.prefsExportedRedacted"),
        detail: target.split(/[\\/]/).pop() ?? target,
      });
    } catch (e) {
      toast({ type: "error", title: t("dataPrivacy.toast.exportError"), detail: String(e).slice(0, 200) });
    } finally {
      setBusy(false);
    }
  }

  // Import prefs from a previously-exported JSON file. Validates the
  // envelope, applies the safe subset via the store, surfaces a toast
  // with the count of applied + ignored keys.
  async function handleImportPrefs() {
    setBusy(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const source = await open({
        title: t("dataPrivacy.toast.importPrefsTitle"),
        multiple: false,
        directory: false,
        filters: [{ name: "Draftboard prefs", extensions: ["json"] }],
      });
      if (!source || Array.isArray(source)) return;
      const text = await readTextFile(source);
      const result = importPrefs(text);
      if (!result.ok) {
        toast({ type: "error", title: t("dataPrivacy.toast.invalidFile"), detail: result.error });
        return;
      }
      // Apply each key sequentially. Awaiting matters because persistOne
      // writes to disk per call — failures would still propagate.
      const setPref = usePrefsStore.getState().set;
      const applied = Object.entries(result.applied);
      for (const [k, v] of applied) {
        await setPref(k as keyof Preferences, v as Preferences[keyof Preferences]);
      }
      toast({
        type: "success",
        title: t("dataPrivacy.toast.imported", { n: applied.length }),
        detail:
          result.ignored.length > 0
            ? t("dataPrivacy.toast.ignored", {
                n: result.ignored.length,
                list: `${result.ignored.slice(0, 3).join(", ")}${
                  result.ignored.length > 3 ? "…" : ""
                }`,
              })
            : undefined,
        durationMs: 8000,
      });
    } catch (e) {
      toast({ type: "error", title: t("dataPrivacy.toast.importError"), detail: String(e).slice(0, 200) });
    } finally {
      setBusy(false);
    }
  }

  async function doClear() {
    await clearAllMatches();
    setMatchCount(0);
    setConfirmClear(false);
  }

  // Native confirm() blocks the renderer + has system styling that
  // breaks the dark-theme. Use ConfirmDialog via state flag instead.
  function clearPrefs() {
    setConfirmClearPrefs(true);
  }
  function doClearPrefs() {
    localStorage.removeItem("lol-draft-prefs");
    location.reload();
  }

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={DATAPRIVACY_TITLE_ID}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[560px] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={DATAPRIVACY_TITLE_ID} className="text-lg font-semibold text-accent mb-3">
          🔐 {t("dataPrivacy.title")}
        </h2>

        <div className="space-y-3 text-sm">
          <Section title={t("dataPrivacy.stored.title")} detail={t("dataPrivacy.stored.detail")}>
            <ul className="list-disc list-inside text-white/70 ml-2 space-y-0.5 text-xs">
              <li><strong>{matchCount}</strong> {t("dataPrivacy.stored.matches")}</li>
              <li>{t("dataPrivacy.stored.identity")}</li>
              <li>{t("dataPrivacy.stored.prefs")}</li>
              <li>{t("dataPrivacy.stored.aggregations")}</li>
              <li>{t("dataPrivacy.stored.apiKeys")}</li>
            </ul>
          </Section>

          <Section title={t("dataPrivacy.notStored.title")} detail="">
            <ul className="list-disc list-inside text-white/70 ml-2 space-y-0.5 text-xs">
              <li>{t("dataPrivacy.notStored.chatLogs")}</li>
              <li>{t("dataPrivacy.notStored.otherPlayers")}</li>
            </ul>
          </Section>

          <Section
            title={t("dataPrivacy.egress.title")}
            detail={t("dataPrivacy.egress.detail")}
          >
            <ul className="list-disc list-inside text-white/70 ml-2 space-y-0.5 text-xs">
              <li>{t("dataPrivacy.egress.crashReports")}</li>
              <li>{t("dataPrivacy.egress.proxy")}</li>
              <li>{t("dataPrivacy.egress.aiProviders")}</li>
            </ul>
          </Section>

          <Section
            title={t("dataPrivacy.backups.title")}
            detail={t("dataPrivacy.backups.detail")}
          >
            {autoBackups.length === 0 ? (
              <p className="text-xs text-white/40 italic mt-1">
                {t("dataPrivacy.backups.empty")}
              </p>
            ) : (
              <ul className="space-y-1 mt-1 text-xs">
                {autoBackups.map((b) => (
                  <li
                    key={b.path}
                    className="flex items-center justify-between gap-2 p-1.5 bg-bg-elev/60 rounded border border-border-subtle"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium tabular-nums">
                        {b.dateLabel}
                      </p>
                      <p className="text-white/50 text-[10px]">
                        {(b.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmRestore(b.path)}
                      disabled={busy}
                      className="text-[10px] uppercase tracking-widest text-meh hover:text-white px-2 py-1 rounded ring-1 ring-meh/40 hover:ring-white/40 transition disabled:opacity-40"
                    >
                      {t("dataPrivacy.backups.restore")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("dataPrivacy.actions.title")} detail="">
            <div className="space-y-2 mt-2">
              <button
                onClick={exportAll}
                className="w-full text-left p-2 bg-bg-card border border-border-subtle rounded hover:border-accent text-sm"
              >
                📥 {t("dataPrivacy.actions.exportAll")}
              </button>
              <button
                onClick={handleBackup}
                disabled={busy}
                className="w-full text-left p-2 bg-bg-card border border-border-subtle rounded hover:border-accent text-sm disabled:opacity-50"
              >
                💾 {t("dataPrivacy.actions.backupDb")}
              </button>
              <button
                onClick={handleRestorePick}
                disabled={busy}
                className="w-full text-left p-2 bg-bg-card border border-meh/40 rounded hover:border-meh text-sm disabled:opacity-50"
              >
                ♻️ {t("dataPrivacy.actions.restoreDb")}
              </button>
              <button
                onClick={() => handleExportPrefs(false)}
                disabled={busy}
                className="w-full text-left p-2 bg-bg-card border border-border-subtle rounded hover:border-accent text-sm disabled:opacity-50"
              >
                📤 {t("dataPrivacy.actions.exportPrefsRedacted")}
              </button>
              <button
                onClick={() => handleExportPrefs(true)}
                disabled={busy}
                className="w-full text-left p-2 bg-bg-card border border-border-subtle rounded hover:border-accent text-sm disabled:opacity-50"
                title={t("dataPrivacy.actions.exportPrefsKeysTitle")}
              >
                📤 {t("dataPrivacy.actions.exportPrefsKeys")}
              </button>
              <button
                onClick={handleImportPrefs}
                disabled={busy}
                className="w-full text-left p-2 bg-bg-card border border-meh/40 rounded hover:border-meh text-sm disabled:opacity-50"
              >
                📥 {t("dataPrivacy.actions.importPrefs")}
              </button>
              <button
                onClick={() => setConfirmClear(true)}
                className="w-full text-left p-2 bg-bg-card border border-bad/40 rounded hover:border-bad text-sm text-bad/90"
              >
                🗑️ {t("dataPrivacy.actions.clearMatches")}
              </button>
              <button
                onClick={clearPrefs}
                className="w-full text-left p-2 bg-bg-card border border-bad/40 rounded hover:border-bad text-sm text-bad/90"
              >
                🗑️ {t("dataPrivacy.actions.resetPrefs")}
              </button>
            </div>
          </Section>
        </div>
      </div>
      {confirmClear && (
        <ConfirmDialog
          title={t("dataPrivacy.confirm.clearMatchesTitle")}
          message={t("dataPrivacy.confirm.clearMatchesMsg", { n: matchCount })}
          confirmLabel={t("dataPrivacy.confirm.clearMatchesConfirm")}
          destructive
          onConfirm={doClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      {confirmRestore && (
        <ConfirmDialog
          title={t("dataPrivacy.confirm.restoreTitle")}
          message={t("dataPrivacy.confirm.restoreMsg", {
            file: confirmRestore.split(/[\\/]/).pop(),
          })}
          confirmLabel={t("dataPrivacy.confirm.restoreConfirm")}
          destructive
          onConfirm={doRestore}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
      {confirmClearPrefs && (
        <ConfirmDialog
          title={t("dataPrivacy.confirm.resetPrefsTitle")}
          message={t("dataPrivacy.confirm.resetPrefsMsg")}
          confirmLabel={t("dataPrivacy.confirm.resetPrefsConfirm")}
          destructive
          onConfirm={doClearPrefs}
          onCancel={() => setConfirmClearPrefs(false)}
        />
      )}
    </div>
  );
}

function Section({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <section className="bg-bg-card border border-border-subtle rounded p-3">
      <p className="font-medium text-white">{title}</p>
      {detail && <p className="text-xs text-white/50 mb-1">{detail}</p>}
      {children}
    </section>
  );
}
