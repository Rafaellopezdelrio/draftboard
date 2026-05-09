import { useEffect, useState } from "react";
import { getAccount, type Region } from "../services/riotApi";
import { loadSettings, saveSettings } from "../services/settingsRepo";
import { getCurrentSummoner } from "../services/lcuService";
import { syncPersonalData } from "../services/personalDataSync";
import { aggregateFromMaster } from "../services/metaAggregator";
import { fetchLatestPatch } from "../services/dataDragon";

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
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState<Region>("euw1");
  const [riotIdName, setRiotIdName] = useState("");
  const [riotIdTag, setRiotIdTag] = useState("");
  const [puuid, setPuuid] = useState<string | undefined>();
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

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

  async function syncMeta() {
    setBusy(true);
    setStatus("Sincronizando meta global...");
    try {
      const cfg = { apiKey, region, riotIdName, riotIdTag };
      const patch = await fetchLatestPatch();
      await aggregateFromMaster(cfg, patch, (p) =>
        setStatus(`${p.phase}: ${p.done}/${p.total}`)
      );
      setStatus("Meta sincronizado ✓ (recarga la app para usarlo)");
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function autoDetect() {
    setStatus("Detectando cuenta del cliente...");
    const s = await getCurrentSummoner();
    if (!s) {
      setStatus("Cliente no abierto. Abre LoL primero.");
      return;
    }
    if (s.gameName) setRiotIdName(s.gameName);
    if (s.tagLine) setRiotIdTag(s.tagLine);
    if (s.puuid) setPuuid(s.puuid);
    if (s.region) {
      const r = s.region.toLowerCase() as Region;
      if (REGIONS.some((x) => x.value === r)) setRegion(r);
    }
    setStatus(`Detectado: ${s.gameName ?? s.displayName ?? "?"}#${s.tagLine ?? "?"}`);
  }

  async function handleSaveAndSync() {
    setBusy(true);
    setStatus("Sincronizando...");
    try {
      // If user provided API key, validate and save it. Otherwise sync via LCU.
      if (apiKey && riotIdName && riotIdTag) {
        const cfg = { apiKey, region, riotIdName, riotIdTag };
        const account = await getAccount(cfg);
        setPuuid(account.puuid);
        await saveSettings({ ...cfg, puuid: account.puuid });
      }
      const result = await syncPersonalData((p) =>
        setStatus(`${p.source}: ${p.message ?? `${p.done}/${p.total}`}`)
      );
      if (result.source === "none") {
        setStatus("Abre el cliente de LoL y reintenta — sin LCU ni API key no puedo sincronizar");
      } else {
        setStatus(`Listo ✓ (${result.matches} partidas vía ${result.source})`);
      }
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev border border-border-subtle rounded-lg p-6 w-[520px] space-y-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-accent">Configuración</h2>

        <div className="bg-bg-card border border-good/30 rounded p-3 text-xs text-white/80">
          <p className="font-medium text-good mb-1">
            ✓ Modo automático (recomendado)
          </p>
          <p>
            Con el cliente de LoL abierto, la app detecta tu cuenta y partidas
            automáticamente. No necesitas hacer nada más.
          </p>
        </div>

        <details className="bg-bg-card border border-border-subtle rounded p-3 text-xs text-white/70">
          <summary className="cursor-pointer text-white/80 font-medium">
            ⚙️ Opciones avanzadas (API key Riot)
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              Solo necesario para: scout de enemigos en champ select, agregación
              global del meta, y para usar la app sin tener el cliente abierto.
            </p>

            <Field label="Riot API Key (opcional)">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="RGAPI-..."
                className="w-full bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white"
              />
              <a
                href="https://developer.riotgames.com/"
                target="_blank"
                className="text-xs text-accent/80 hover:text-accent"
                rel="noreferrer"
              >
                Obtén tu key en developer.riotgames.com →
              </a>
            </Field>
          </div>
        </details>

        <Field label="Región">
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

        <Field label="Riot ID">
          <div className="flex gap-2">
            <input
              value={riotIdName}
              onChange={(e) => setRiotIdName(e.target.value)}
              placeholder="Faker"
              className="flex-1 bg-bg px-3 py-2 rounded border border-border-subtle text-white"
            />
            <span className="self-center text-white/40">#</span>
            <input
              value={riotIdTag}
              onChange={(e) => setRiotIdTag(e.target.value)}
              placeholder="KR1"
              className="w-24 bg-bg px-3 py-2 rounded border border-border-subtle text-white"
            />
          </div>
          <button
            onClick={autoDetect}
            type="button"
            className="text-xs text-accent/80 hover:text-accent mt-1"
          >
            🔍 Auto-detectar desde el cliente de LoL
          </button>
        </Field>

        {puuid && (
          <p className="text-xs text-white/40 truncate">PUUID: {puuid}</p>
        )}

        {status && (
          <p
            className={`text-sm ${status.startsWith("Error") ? "text-bad" : status.startsWith("Listo") ? "text-good" : "text-white/70"}`}
          >
            {status}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white/70 hover:text-white"
          >
            Cancelar
          </button>
          <button
            disabled={busy || !apiKey}
            onClick={syncMeta}
            type="button"
            className="px-3 py-2 bg-bg-card border border-border-subtle rounded text-white/80 hover:border-accent disabled:opacity-50"
          >
            Sincronizar meta
          </button>
          <button
            disabled={busy || !apiKey || !riotIdName || !riotIdTag}
            onClick={handleSaveAndSync}
            className="px-4 py-2 bg-accent text-black font-medium rounded disabled:opacity-50"
          >
            {busy ? "..." : "Guardar y sincronizar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-white/50">
        {label}
      </label>
      {children}
    </div>
  );
}

