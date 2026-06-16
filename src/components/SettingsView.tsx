import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../hooks/useFocusTrap";

const SETTINGS_TITLE_ID = "settings-view-title";
import { getAccount, getRiotProxyUrl, type Region } from "../services/riotApi";
import { loadSettings, saveSettings } from "../services/settingsRepo";
import { getCurrentSummoner } from "../services/lcuService";
import { syncPersonalData } from "../services/personalDataSync";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { clearAllMatches } from "../services/matchRepo";
import { aggregateFromProPlay } from "../services/proPlayAggregator";
import { loadChampionDb } from "../services/championDb";
import { usePrefsStore } from "../state/prefsStore";
import { aggregateFromMaster, aggregateMultiRegion } from "../services/metaAggregator";
import { fetchLatestPatch } from "../services/dataDragon";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type UiLocale } from "../i18n";
import { HelpTip } from "./ui/HelpTip";

const REGIONS: { value: Region; label: string }[] = [
  { value: "euw1", label: "EU West" },
  { value: "eun1", label: "EU Nordic & East" },
  { value: "na1", label: "North America" },
  { value: "kr", label: "Korea" },
  { value: "br1", label: "Brazil" },
  { value: "la1", label: "LAN" },
  { value: "la2", label: "LAS" },
  { value: "tr1", label: "Turkey" },
  { value: "oc1", label: "OCE" },
  { value: "jp1", label: "Japan" },
];

interface Props {
  onClose: () => void;
}

export function SettingsView({ onClose }: Props) {
  const { t } = useTranslation();
  useEscape(onClose);
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState<Region>("euw1");
  const [riotIdName, setRiotIdName] = useState("");
  const [riotIdTag, setRiotIdTag] = useState("");
  const [puuid, setPuuid] = useState<string | undefined>();
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmResync, setConfirmResync] = useState(false);
  // Riot API access available — either local apiKey OR the Cloudflare
  // Worker proxy is configured. Previously the sync buttons were gated
  // ONLY on `apiKey`, which meant proxy users (no local key set)
  // couldn't trigger any sync action — the buttons sat disabled with
  // no explanation. This flag reflects the real "can we make Riot
  // API calls" capability.
  const hasRiotAccess = !!apiKey || !!getRiotProxyUrl();

  useEffect(() => {
    loadSettings().then((s) => {
      if (!s) return;
      setApiKey(s.apiKey);
      setRegion(s.region);
      setRiotIdName(s.riotIdName);
      setRiotIdTag(s.riotIdTag);
      setPuuid(s.puuid);
    });
  }, []);

  function requestResync() {
    setConfirmResync(true);
  }

  async function resyncAll() {
    setConfirmResync(false);
    setBusy(true);
    setStatus(t("settings.savingConfig"));
    try {
      // Save current input values FIRST so sync uses the latest API key.
      // If user just regenerated the key but didn't click "Guardar", resync
      // would otherwise use the stale key from DB.
      const hasRiotAccess = !!apiKey || !!getRiotProxyUrl();
      if (hasRiotAccess && riotIdName && riotIdTag) {
        try {
          const cfg = { apiKey, region, riotIdName, riotIdTag };
          const account = await getAccount(cfg);
          setPuuid(account.puuid);
          await saveSettings({ ...cfg, puuid: account.puuid });
        } catch (e) {
          setStatus(t("settings.errorValidatingRiotId", { error: String(e) }));
          setBusy(false);
          return;
        }
      } else if (apiKey) {
        await saveSettings({ apiKey, region, riotIdName, riotIdTag, puuid });
      }
      setStatus(t("settings.deletingOldMatches"));
      await clearAllMatches();
      const result = await syncPersonalData((p) =>
        setStatus(`${p.source}: ${p.message ?? `${p.done}/${p.total}`}`)
      );
      setStatus(t("settings.resyncDone", { matches: result.matches, source: result.source }));
    } catch (e) {
      setStatus(t("settings.error", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function syncMeta() {
    setBusy(true);
    setStatus(t("settings.syncingMetaSoloq"));
    try {
      const cfg = { apiKey, region, riotIdName, riotIdTag };
      const patch = await fetchLatestPatch();
      await aggregateFromMaster(cfg, patch, (p) =>
        setStatus(`${p.phase}: ${p.done}/${p.total}`)
      );
      setStatus(t("settings.metaSoloqDone"));
    } catch (e) {
      setStatus(t("settings.error", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  const proPlayDays = usePrefsStore((s) => s.prefs.proPlayDaysWindow);

  async function syncMetaMultiRegion() {
    // Allow either a local apiKey OR proxy — proxy injects the key
    // server-side so the local store stays empty for proxy users.
    if (!hasRiotAccess) return;
    setBusy(true);
    setStatus(t("settings.syncingMultiRegion"));
    try {
      const cfg = { apiKey, region, riotIdName, riotIdTag };
      const patch = await fetchLatestPatch();
      await aggregateMultiRegion(cfg, patch, (p) =>
        setStatus(`${p.phase}: ${p.done}/${p.total}`)
      );
      setStatus(t("settings.multiRegionDone"));
    } catch (e) {
      setStatus(t("settings.errorMultiRegion", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function syncProMeta() {
    setBusy(true);
    setStatus(t("settings.downloadingPro"));
    try {
      const db = await loadChampionDb(true);
      const patch = await fetchLatestPatch();
      const result = await aggregateFromProPlay(db, patch, proPlayDays, (p) =>
        setStatus(`${p.phase}: ${p.done}/${p.total}`)
      );
      setStatus(
        t("settings.proMetaDone", { games: result.games, rows: result.rows })
      );
    } catch (e) {
      setStatus(t("settings.errorProMeta", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function autoDetect() {
    setStatus(t("settings.detectingAccount"));
    const s = await getCurrentSummoner();
    if (!s) {
      setStatus(t("settings.clientNotOpen"));
      return;
    }
    if (s.gameName) setRiotIdName(s.gameName);
    if (s.tagLine) setRiotIdTag(s.tagLine);
    if (s.puuid) setPuuid(s.puuid);
    if (s.region) {
      const r = s.region.toLowerCase() as Region;
      if (REGIONS.some((x) => x.value === r)) setRegion(r);
    }
    setStatus(
      t("settings.detected", {
        name: s.gameName ?? s.displayName ?? "?",
        tag: s.tagLine ?? "?",
      })
    );
  }

  async function handleSaveAndSync() {
    setBusy(true);
    setStatus(t("settings.syncing"));
    try {
      // Validate Riot ID via Riot API (works with personal apiKey OR proxy).
      // This refreshes the encrypted puuid in storage — critical if the user
      // had a stale LCU-format puuid stored from earlier sessions.
      const hasRiotAccess = !!apiKey || !!getRiotProxyUrl();
      if (hasRiotAccess && riotIdName && riotIdTag) {
        const cfg = { apiKey, region, riotIdName, riotIdTag };
        const account = await getAccount(cfg);
        setPuuid(account.puuid);
        await saveSettings({ ...cfg, puuid: account.puuid });
      }
      const result = await syncPersonalData((p) =>
        setStatus(`${p.source}: ${p.message ?? `${p.done}/${p.total}`}`)
      );
      if (result.source === "none") {
        setStatus(t("settings.openClientRetry"));
      } else {
        setStatus(t("settings.syncDoneReady", { matches: result.matches, source: result.source }));
      }
    } catch (e) {
      setStatus(t("settings.error", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={SETTINGS_TITLE_ID}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-6 w-[520px] space-y-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={SETTINGS_TITLE_ID} className="text-lg font-semibold text-accent">{t("settings.title")}</h2>

        <ProxyOrLcuStatusBanner />

        <div className="bg-bg-card border border-good/30 rounded p-3 text-xs text-white/80">
          <p className="font-medium text-good mb-1">
            {t("settings.autoModeTitle")}
          </p>
          <p>{t("settings.autoModeBody")}</p>
          <p className="mt-1.5 text-white/55">
            {t("settings.autoModeProxyPrefix")}{" "}
            <strong className="text-accent">{t("settings.autoModeProxyName")}</strong>{" "}
            {t("settings.autoModeProxySuffix")}
          </p>
        </div>

        <details className="bg-bg-card border border-border-subtle rounded p-3 text-xs text-white/70">
          <summary className="cursor-pointer text-white/80 font-medium">
            {t("settings.advancedOptions")}
          </summary>
          <div className="mt-3 space-y-3">
            <p>{t("settings.advancedBody")}</p>

            <Field
              label={t("settings.apiKeyLabel")}
              hint={t("settings.apiKeyHint")}
            >
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value.trim())}
                onPaste={(e) => {
                  // Strip whitespace/newlines from pasted content
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text").trim();
                  setApiKey(pasted);
                }}
                placeholder="RGAPI-..."
                className="w-full bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white"
              />
              {apiKey && !apiKey.startsWith("RGAPI-") && (
                <p className="text-[11px] text-bad mt-1">
                  {t("settings.apiKeyWarningPrefix")} <code>RGAPI-</code>{t("settings.apiKeyWarningSuffix")}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <a
                  href="https://developer.riotgames.com/"
                  target="_blank"
                  className="text-xs text-accent/80 hover:text-accent"
                  rel="noreferrer"
                >
                  {t("settings.getKey")}
                </a>
                {apiKey && (
                  <span className="text-xs text-meh">
                    {t("settings.devKeysExpire")}
                  </span>
                )}
              </div>
            </Field>
          </div>
        </details>

        <Field label="Idioma / Language">
          <LocalePicker />
        </Field>

        <Field
          label={t("settings.updateChannel")}
          hint={t("settings.updateChannelHint")}
        >
          <UpdateChannelPicker />
        </Field>

        <Field
          label={t("settings.regionLabel")}
          hint={t("settings.regionHint")}
        >
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as Region)}
            className="w-full bg-bg px-3 py-2 rounded border border-border-subtle text-white"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t("settings.riotIdLabel")}
          hint={t("settings.riotIdHint")}
        >
          <div className="flex gap-2">
            <input
              value={riotIdName}
              onChange={(e) => setRiotIdName(e.target.value)}
              onBlur={(e) => setRiotIdName(e.target.value.trim())}
              placeholder="Faker"
              className="flex-1 bg-bg px-3 py-2 rounded border border-border-subtle text-white"
            />
            <span className="self-center text-white/40">#</span>
            <input
              value={riotIdTag}
              onChange={(e) => setRiotIdTag(e.target.value)}
              onBlur={(e) => setRiotIdTag(e.target.value.trim())}
              placeholder="KR1"
              className="w-24 bg-bg px-3 py-2 rounded border border-border-subtle text-white"
            />
          </div>
          <button
            onClick={autoDetect}
            type="button"
            className="text-xs text-accent/80 hover:text-accent mt-1"
          >
            {t("settings.autoDetect")}
          </button>
        </Field>

        {puuid && (
          <p className="text-xs text-white/40 truncate">PUUID: {puuid}</p>
        )}

        {status && (
          <p
            className={`text-sm ${/rror/.test(status) ? "text-bad" : status.includes("✓") ? "text-good" : "text-white/70"}`}
          >
            {status}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white/70 hover:text-white"
          >
            {t("common.cancel")}
          </button>
          <button
            disabled={busy}
            onClick={requestResync}
            type="button"
            className="px-3 py-2 bg-bg-card border border-bad/40 rounded text-bad/90 hover:border-bad disabled:opacity-50"
            title={t("settings.resyncTooltip")}
          >
            {t("settings.resync")}
          </button>
          <button
            disabled={busy}
            onClick={syncProMeta}
            type="button"
            className="px-3 py-2 bg-accent/10 border border-accent/40 rounded text-accent hover:bg-accent/20 disabled:opacity-50"
            title={t("settings.syncProTooltip")}
          >
            {t("settings.syncProMeta")}
          </button>
          <button
            disabled={busy || !hasRiotAccess}
            onClick={syncMeta}
            type="button"
            className="px-3 py-2 bg-bg-card border border-border-subtle rounded text-white/80 hover:border-accent disabled:opacity-50"
            title={
              hasRiotAccess
                ? t("settings.syncMetaTooltip")
                : t("settings.needKeyOrProxy")
            }
          >
            {t("settings.syncMetaSoloq")}
          </button>
          <button
            disabled={busy || !hasRiotAccess}
            onClick={syncMetaMultiRegion}
            type="button"
            className="px-3 py-2 bg-bg-card border border-purple-400/40 rounded text-purple-300 hover:bg-purple-400/10 disabled:opacity-50"
            title={
              hasRiotAccess
                ? t("settings.multiRegionTooltip")
                : t("settings.needKeyOrProxy")
            }
          >
            {t("settings.multiRegion")}
          </button>
          <button
            disabled={busy || !hasRiotAccess || !riotIdName || !riotIdTag}
            onClick={handleSaveAndSync}
            className="px-4 py-2 bg-accent text-black font-medium rounded disabled:opacity-50"
            title={
              !hasRiotAccess
                ? t("settings.needKeyOrProxyShort")
                : !riotIdName || !riotIdTag
                  ? t("settings.completeRiotId")
                  : t("settings.saveSyncTooltip")
            }
          >
            {busy ? "..." : t("settings.saveAndSync")}
          </button>
        </div>
      </div>
      {confirmResync && (
        <ConfirmDialog
          title={t("settings.resyncConfirmTitle")}
          message={t("settings.resyncConfirmMsg")}
          confirmLabel={t("settings.resyncConfirmLabel")}
          destructive
          onConfirm={resyncAll}
          onCancel={() => setConfirmResync(false)}
        />
      )}
    </div>
  );
}

/** Update channel picker. Stable (default) = vetted releases only.
 * Beta = opt-in to pre-release builds for early access (may have bugs).
 * appUpdater reads `prefs.updateChannel` on every check + selects the
 * matching manifest URL — flipping this triggers a new check on next
 * mount of useUpdateCheck. */
function UpdateChannelPicker() {
  const { t } = useTranslation();
  const channel = usePrefsStore((s) => s.prefs.updateChannel);
  const setPref = usePrefsStore((s) => s.set);
  return (
    <select
      value={channel}
      onChange={(e) =>
        setPref("updateChannel", e.target.value as "stable" | "beta")
      }
      aria-label={t("settings.updateChannel")}
      className="w-full bg-bg px-3 py-2 rounded border border-border-subtle text-white"
    >
      <option value="stable">{t("settings.stableOption")}</option>
      <option value="beta">{t("settings.betaOption")}</option>
    </select>
  );
}

/** Locale picker. Reads + writes prefs.uiLocale; the App.tsx effect
 * watches that pref and calls setUiLocale on i18next. Keeping the
 * picker dumb means future locale additions only need a new entry in
 * SUPPORTED_LOCALES — no UI changes here. */
function LocalePicker() {
  const { t } = useTranslation();
  const uiLocale = usePrefsStore((s) => s.prefs.uiLocale);
  const setPref = usePrefsStore((s) => s.set);
  return (
    <select
      value={uiLocale}
      onChange={(e) => setPref("uiLocale", e.target.value as UiLocale)}
      aria-label={t("settings.languageHint")}
      className="w-full bg-bg px-3 py-2 rounded border border-border-subtle text-white"
    >
      {SUPPORTED_LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_LABELS[loc]}
        </option>
      ))}
    </select>
  );
}

function ProxyOrLcuStatusBanner() {
  const { t } = useTranslation();
  const proxyUrl = usePrefsStore((s) => s.prefs.riotProxyUrl);
  if (proxyUrl.trim().length === 0) return null;
  return (
    <div className="bg-bg-card border border-purple-400/40 rounded p-3 text-xs text-white/85">
      <p className="font-medium text-purple-300 mb-1">
        {t("settings.proxyActiveTitle")}
      </p>
      <p>
        {t("settings.proxyActiveBodyPrefix")}{" "}
        <code className="text-accent">{shortUrl(proxyUrl)}</code>{" "}
        {t("settings.proxyActiveBodySuffix")}
      </p>
    </div>
  );
}

function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host;
  } catch {
    return u;
  }
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  /** Optional inline help — rendered as a (?) icon next to the label.
   * Use for technical fields where the input semantics aren't obvious
   * from the label alone (region codes, API key formats, etc). */
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-white/50 flex items-center">
        {label}
        {hint && <HelpTip hint={hint} />}
      </label>
      {children}
    </div>
  );
}

