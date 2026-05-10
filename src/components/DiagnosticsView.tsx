import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetchLatestPatch } from "../services/dataDragon";
import { loadSettings } from "../services/settingsRepo";
import { getAccount } from "../services/riotApi";

interface Props {
  onClose: () => void;
}

interface Check {
  name: string;
  status: "pending" | "ok" | "warn" | "fail";
  detail?: string;
}

export function DiagnosticsView({ onClose }: Props) {
  const [checks, setChecks] = useState<Check[]>([
    { name: "Conexión a internet", status: "pending" },
    { name: "Data Dragon (Riot CDN)", status: "pending" },
    { name: "Cliente de LoL (LCU)", status: "pending" },
    { name: "Cuenta Riot (vía LCU)", status: "pending" },
    { name: "Riot API Key", status: "pending" },
    { name: "AI provider key", status: "pending" },
    { name: "Base de datos local", status: "pending" },
  ]);

  useEffect(() => {
    runChecks();
  }, []);

  async function runChecks() {
    const next: Check[] = [];

    // 1. Internet
    try {
      await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { signal: AbortSignal.timeout(5000) });
      next.push({ name: "Conexión a internet", status: "ok" });
    } catch {
      next.push({ name: "Conexión a internet", status: "fail", detail: "Sin red. Comprueba tu conexión." });
    }

    // 2. Data Dragon
    try {
      const patch = await fetchLatestPatch();
      next.push({ name: "Data Dragon (Riot CDN)", status: "ok", detail: `Patch ${patch}` });
    } catch (e) {
      next.push({ name: "Data Dragon (Riot CDN)", status: "fail", detail: String(e) });
    }

    // 3. LCU
    try {
      const lcu = await invoke<{ puuid: string; gameName?: string }>("lcu_current_summoner");
      next.push({
        name: "Cliente de LoL (LCU)",
        status: "ok",
        detail: `Conectado: ${lcu.gameName ?? "?"}`,
      });
      next.push({
        name: "Cuenta Riot (vía LCU)",
        status: "ok",
        detail: `PUUID: ${lcu.puuid.slice(0, 8)}...`,
      });
    } catch {
      next.push({
        name: "Cliente de LoL (LCU)",
        status: "warn",
        detail: "Cliente cerrado. Abre LoL para usar todas las features.",
      });
      next.push({
        name: "Cuenta Riot (vía LCU)",
        status: "warn",
        detail: "Sin LCU activo",
      });
    }

    // 4. Riot API key
    const cfg = await loadSettings();
    if (!cfg?.apiKey) {
      next.push({
        name: "Riot API Key",
        status: "warn",
        detail: "No configurada (opcional, solo necesaria para scout y meta global)",
      });
    } else {
      try {
        await getAccount(cfg);
        next.push({ name: "Riot API Key", status: "ok", detail: "Válida" });
      } catch (e) {
        next.push({
          name: "Riot API Key",
          status: "fail",
          detail: `Inválida o caducada: ${String(e).slice(0, 80)}`,
        });
      }
    }

    // 5. Anthropic
    const prefsRaw = localStorage.getItem("lol-draft-prefs");
    let aiKey = "";
    let provider = "groq";
    if (prefsRaw) {
      try {
        const p = JSON.parse(prefsRaw);
        provider = p.aiProvider ?? "groq";
        aiKey =
          provider === "groq"
            ? p.groqApiKey
            : provider === "gemini"
              ? p.geminiApiKey
              : p.anthropicApiKey;
        aiKey = aiKey ?? "";
      } catch {}
    }
    if (!aiKey) {
      next.push({
        name: "AI provider key",
        status: "warn",
        detail: `No configurada (opcional, ${provider}). Groq es gratis.`,
      });
    } else {
      next.push({
        name: "AI provider key",
        status: "ok",
        detail: `Configurada (${provider})`,
      });
    }

    // 6. DB
    try {
      const { getDb } = await import("../db/client");
      const db = await getDb();
      await db.select("SELECT COUNT(*) FROM matches");
      next.push({ name: "Base de datos local", status: "ok" });
    } catch (e) {
      next.push({ name: "Base de datos local", status: "fail", detail: String(e) });
    }

    setChecks(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] bg-bg-elev border border-border-subtle rounded-lg p-4 w-[560px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-accent">Diagnóstico</h2>
          <button
            onClick={runChecks}
            className="text-xs px-2 py-1 bg-bg-card rounded border border-border-subtle hover:border-accent text-white/80"
          >
            Reintentar
          </button>
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
