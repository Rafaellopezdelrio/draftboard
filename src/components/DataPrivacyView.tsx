import { useEffect, useState } from "react";
import { recentMatches, clearAllMatches } from "../services/matchRepo";
import { useEscape } from "../hooks/useKeyboardShortcuts";

interface Props {
  onClose: () => void;
}

export function DataPrivacyView({ onClose }: Props) {
  const [matchCount, setMatchCount] = useState(0);
  useEscape(onClose);

  useEffect(() => {
    recentMatches(1000).then((m) => setMatchCount(m.length));
  }, []);

  async function exportAll() {
    const matches = await recentMatches(1000);
    const settings = localStorage.getItem("lol-draft-prefs");
    const data = {
      exportedAt: new Date().toISOString(),
      matches,
      preferences: settings ? JSON.parse(settings) : null,
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

  async function clearMatches() {
    if (!confirm("¿Borrar TODAS tus partidas guardadas? No se puede deshacer.")) return;
    await clearAllMatches();
    setMatchCount(0);
  }

  function clearPrefs() {
    if (!confirm("¿Restablecer todas las preferencias?")) return;
    localStorage.removeItem("lol-draft-prefs");
    location.reload();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] bg-bg-elev border border-border-subtle rounded-lg p-4 w-[560px] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-accent mb-3">
          🔐 Tus datos
        </h2>

        <div className="space-y-3 text-sm">
          <Section title="¿Qué guardamos?" detail="Todo en SQLite local. Nada sale de tu PC.">
            <ul className="list-disc list-inside text-white/70 ml-2 space-y-0.5 text-xs">
              <li><strong>{matchCount}</strong> partidas (KDA, CS, campeón, queue)</li>
              <li>Tu PUUID y Riot ID (solo para identificarte ante Riot API)</li>
              <li>Preferencias de la app (toggles)</li>
              <li>Aggregations Master+ (anónimo, datos públicos)</li>
              <li>API keys que metas (Riot/Anthropic) — nunca se comparten</li>
            </ul>
          </Section>

          <Section title="Lo que NO guardamos" detail="">
            <ul className="list-disc list-inside text-white/70 ml-2 space-y-0.5 text-xs">
              <li>Logs de chat con AI Coach (ephemerales en memoria)</li>
              <li>Telemetría / analytics</li>
              <li>Información de otros jugadores más allá del scout temporal</li>
            </ul>
          </Section>

          <Section title="Acciones" detail="">
            <div className="space-y-2 mt-2">
              <button
                onClick={exportAll}
                className="w-full text-left p-2 bg-bg-card border border-border-subtle rounded hover:border-accent text-sm"
              >
                📥 Exportar todos mis datos (JSON)
              </button>
              <button
                onClick={clearMatches}
                className="w-full text-left p-2 bg-bg-card border border-bad/40 rounded hover:border-bad text-sm text-bad/90"
              >
                🗑️ Borrar todas mis partidas guardadas
              </button>
              <button
                onClick={clearPrefs}
                className="w-full text-left p-2 bg-bg-card border border-bad/40 rounded hover:border-bad text-sm text-bad/90"
              >
                🗑️ Restablecer todas las preferencias
              </button>
            </div>
          </Section>
        </div>
      </div>
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
