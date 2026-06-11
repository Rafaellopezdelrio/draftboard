import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { fetchLatestPatch } from "../services/dataDragon";
import { loadSettings } from "../services/settingsRepo";
import { getAccount } from "../services/riotApi";
import { Copy, RefreshCw } from "lucide-react";
import { NETWORK_TIMEOUTS_MS, UI_FEEDBACK_MS, WORKER_HEALTH_URL } from "../config";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useEscape } from "../hooks/useKeyboardShortcuts";

const DIAG_TITLE_ID = "diagnostics-view-title";

interface Props {
  onClose: () => void;
}

interface Check {
  name: string;
  status: "pending" | "ok" | "warn" | "fail";
  detail?: string;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function DiagnosticsView({ onClose }: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEscape(onClose);
  useFocusTrap(dialogRef, true);
  const [checks, setChecks] = useState<Check[]>([
    { name: t("diagnostics.checks.internet"), status: "pending" },
    { name: "Data Dragon (Riot CDN)", status: "pending" },
    { name: "Cloudflare Worker (backend)", status: "pending" },
    { name: t("diagnostics.checks.lcuClient"), status: "pending" },
    { name: "Live Client API (in-game)", status: "pending" },
    { name: t("diagnostics.checks.riotAccount"), status: "pending" },
    { name: "Riot API Key", status: "pending" },
    { name: "AI provider key", status: "pending" },
    { name: t("diagnostics.checks.db"), status: "pending" },
    { name: "App version", status: "pending" },
  ]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    runChecks();
  }, []);

  async function runChecks() {
    // Run all probes in parallel — previously the LCU check alone could
    // hold up the whole report by 5s when LoL was closed. With Promise.all
    // the slowest check (the timeout) sets the total time.
    const probes: Array<Promise<Check>> = [
      // 1. Internet
      (async () => {
        try {
          await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
            signal: AbortSignal.timeout(NETWORK_TIMEOUTS_MS.diagnostic),
          });
          return { name: t("diagnostics.checks.internet"), status: "ok" };
        } catch {
          return { name: t("diagnostics.checks.internet"), status: "fail", detail: t("diagnostics.detail.noNet") };
        }
      })(),

      // 2. Data Dragon
      (async () => {
        try {
          const patch = await fetchLatestPatch();
          return { name: "Data Dragon (Riot CDN)", status: "ok", detail: `Patch ${patch}` };
        } catch (e) {
          return { name: "Data Dragon (Riot CDN)", status: "fail", detail: String(e) };
        }
      })(),

      // 3. Cloudflare Worker — our backend that proxies Riot API, op.gg,
      // dpm.lol, pro-builds, AI providers + serves the updater manifest.
      (async () => {
        try {
          const res = await fetch(WORKER_HEALTH_URL, {
            signal: AbortSignal.timeout(NETWORK_TIMEOUTS_MS.diagnostic),
            cache: "no-store",
          });
          return res.ok
            ? { name: "Cloudflare Worker (backend)", status: "ok", detail: `HTTP ${res.status}` }
            : { name: "Cloudflare Worker (backend)", status: "warn", detail: t("diagnostics.detail.workerDegraded", { status: res.status }) };
        } catch (e) {
          return { name: "Cloudflare Worker (backend)", status: "fail", detail: t("diagnostics.detail.workerUnreachable", { detail: String(e).slice(0, 80) }) };
        }
      })(),

      // 4 + 5. LCU client + account, both derived from one invocation.
      // Returns a sentinel Check object whose `name` field encodes the
      // PAIR; we split it after Promise.all completes.
      (async () => {
        try {
          const lcu = await invoke<{ puuid: string; gameName?: string }>(
            "lcu_current_summoner"
          );
          return {
            name: "__lcu_pair__",
            status: "ok" as const,
            detail: JSON.stringify({ gameName: lcu.gameName ?? "?", puuid: lcu.puuid.slice(0, 8) }),
          };
        } catch {
          return {
            name: "__lcu_pair__",
            status: "warn" as const,
            detail: "",
          };
        }
      })(),

      // 6. Live Client API (only available DURING a match)
      (async () => {
        try {
          const live = await invoke<unknown>("live_client_all_game_data");
          return live && typeof live === "object"
            ? { name: "Live Client API (in-game)", status: "ok", detail: t("diagnostics.detail.liveAvailable") }
            : { name: "Live Client API (in-game)", status: "warn", detail: t("diagnostics.detail.liveNoGame") };
        } catch {
          return { name: "Live Client API (in-game)", status: "warn", detail: t("diagnostics.detail.liveNoGame") };
        }
      })(),

      // 7. Riot API key
      (async () => {
        const cfg = await loadSettings();
        if (!cfg?.apiKey) {
          return { name: "Riot API Key", status: "warn", detail: t("diagnostics.detail.riotKeyMissing") };
        }
        try {
          await getAccount(cfg);
          return { name: "Riot API Key", status: "ok", detail: t("diagnostics.detail.riotKeyValid") };
        } catch (e) {
          return { name: "Riot API Key", status: "fail", detail: t("diagnostics.detail.riotKeyInvalid", { detail: String(e).slice(0, 80) }) };
        }
      })(),

      // 8. AI provider key
      (async () => {
        const prefsRaw = localStorage.getItem("lol-draft-prefs");
        let aiKey = "";
        let provider = "groq";
        if (prefsRaw) {
          try {
            const p = JSON.parse(prefsRaw);
            provider = p.aiProvider ?? "groq";
            aiKey =
              provider === "groq" ? p.groqApiKey
                : provider === "gemini" ? p.geminiApiKey
                  : p.anthropicApiKey;
            aiKey = aiKey ?? "";
          } catch {
            // Corrupt prefs blob — keep the groq/empty defaults set above so
            // the diagnostics check still runs instead of throwing.
          }
        }
        return aiKey
          ? { name: "AI provider key", status: "ok", detail: t("diagnostics.detail.aiConfigured", { provider }) }
          : { name: "AI provider key", status: "warn", detail: t("diagnostics.detail.aiMissing", { provider }) };
      })(),

      // 9. DB
      (async () => {
        try {
          const { getDb } = await import("../db/client");
          const db = await getDb();
          await db.select("SELECT COUNT(*) FROM matches");
          return { name: t("diagnostics.checks.db"), status: "ok" };
        } catch (e) {
          return { name: t("diagnostics.checks.db"), status: "fail", detail: String(e) };
        }
      })(),
    ];

    const results = (await Promise.all(probes)) as Check[];

    // Expand the LCU sentinel into the two real checks. Done here (not in
    // the probe) because we want display order independent of Promise
    // settle order.
    const next: Check[] = [];
    for (const c of results) {
      if (c.name === "__lcu_pair__") {
        let parsed: { gameName?: string; puuid?: string } | null = null;
        if (c.status === "ok" && c.detail) {
          try {
            parsed = JSON.parse(c.detail);
          } catch {
            // Malformed detail — fall through to the "closed" branch below
            // rather than throwing out of the whole diagnostics render loop.
            parsed = null;
          }
        }
        if (parsed) {
          next.push({
            name: t("diagnostics.checks.lcuClient"),
            status: "ok",
            detail: t("diagnostics.detail.lcuConnected", { name: parsed.gameName }),
          });
          next.push({
            name: t("diagnostics.checks.riotAccount"),
            status: "ok",
            detail: t("diagnostics.detail.lcuPuuid", { puuid: parsed.puuid }),
          });
        } else {
          next.push({
            name: t("diagnostics.checks.lcuClient"),
            status: "warn",
            detail: t("diagnostics.detail.lcuClosed"),
          });
          next.push({
            name: t("diagnostics.checks.riotAccount"),
            status: "warn",
            detail: t("diagnostics.detail.lcuNoActive"),
          });
        }
      } else {
        next.push(c);
      }
    }

    // 10. App version — useful for support requests + comparing local
    // build vs latest release on the updater channel.
    if (isTauri()) {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        next.push({ name: "App version", status: "ok", detail: `v${v}` });
      } catch {
        next.push({ name: "App version", status: "warn", detail: t("diagnostics.detail.versionUnknown") });
      }
    } else {
      next.push({ name: "App version", status: "warn", detail: t("diagnostics.detail.versionBrowser") });
    }

    setChecks(next);
  }

  /** Copy the current diagnostic snapshot as plain text — useful for
   * pasting into bug reports without screenshots. */
  async function copyReport() {
    const lines = checks.map((c) => {
      const icon = c.status === "ok" ? "OK " : c.status === "warn" ? "WARN" : c.status === "fail" ? "FAIL" : "... ";
      const tail = c.detail ? `  ${c.detail}` : "";
      return `[${icon}] ${c.name}${tail}`;
    });
    const text = `Draftboard diagnostic report\n${new Date().toISOString()}\n${"-".repeat(40)}\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), UI_FEEDBACK_MS.clipboardCopy);
    } catch {
      // Fall back to manual select — rare but possible on locked-down
      // browsers. We give up silently and let the user screenshot.
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={DIAG_TITLE_ID}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[560px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id={DIAG_TITLE_ID} className="text-lg font-semibold text-accent">{t("diagnostics.title")}</h2>
          <div className="flex gap-2">
            <button
              onClick={copyReport}
              className="text-xs px-2 py-1 bg-bg-card rounded border border-border-subtle hover:border-accent text-white/80 flex items-center gap-1"
              title={t("diagnostics.copyReport")}
            >
              <Copy className="w-3 h-3" />
              {copied ? t("errors.copied") : t("diagnostics.copyReport")}
            </button>
            <button
              onClick={runChecks}
              className="text-xs px-2 py-1 bg-bg-card rounded border border-border-subtle hover:border-accent text-white/80 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              {t("diagnostics.rerun")}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          {checks.map((c, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-2 rounded bg-bg-card border border-border-subtle"
            >
              <StatusIcon status={c.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{c.name}</p>
                {c.detail && (
                  <p className="text-xs text-white/60 break-words">{c.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Check["status"] }) {
  const map = {
    pending: { icon: "⋯", color: "text-white/30" },
    ok: { icon: "✓", color: "text-good" },
    warn: { icon: "!", color: "text-meh" },
    fail: { icon: "✗", color: "text-bad" },
  };
  const { icon, color } = map[status];
  return <span className={`text-lg leading-none w-5 ${color}`}>{icon}</span>;
}
