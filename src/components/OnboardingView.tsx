import { useState } from "react";
import { usePrefsStore } from "../state/prefsStore";
import { syncPersonalData, type SyncProgress } from "../services/personalDataSync";
import { getCurrentSummoner } from "../services/lcuService";

interface Props {
  onClose: () => void;
}

type Step = "welcome" | "level" | "syncing" | "done";

export function OnboardingView({ onClose }: Props) {
  const set = usePrefsStore((s) => s.set);
  const [step, setStep] = useState<Step>("welcome");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [summary, setSummary] = useState<string>("");

  async function handleStart() {
    setStep("syncing");
    // Hard cap: 12s. If LCU is unreachable, don't block the user forever.
    const timeout = new Promise<{ timeout: true }>((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 12_000)
    );
    const work = (async () => {
      const summoner = await getCurrentSummoner();
      const result = await syncPersonalData(setProgress);
      return { summoner, result };
    })();
    const race = await Promise.race([work, timeout]);

    if ("timeout" in race) {
      setSummary(
        "El cliente de LoL no responde. Puedes seguir en modo manual y abrir el cliente más tarde — la app se conectará sola."
      );
      setStep("done");
      return;
    }

    const { summoner, result } = race;
    if (result.source === "none") {
      setSummary(
        "No detectamos el cliente de LoL abierto. Puedes seguir en modo manual — la app se conectará sola cuando lo abras."
      );
    } else {
      setSummary(
        `${summoner?.gameName ?? "Cuenta"}#${summoner?.tagLine ?? ""} — ${result.matches} partidas + ${result.masteries} maestrías sincronizadas vía ${result.source}.`
      );
    }
    setStep("done");
  }

  function skipToManual() {
    setSummary("Modo manual activado. Cuando abras el cliente de LoL, la app detectará tu cuenta automáticamente.");
    setStep("done");
  }

  async function handleFinish() {
    await set("onboardingDone", true);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-6 w-[520px] space-y-4">
        {step === "welcome" && (
          <>
            <h2 className="text-2xl font-bold text-accent">
              Bienvenido a LoL Draft Advisor
            </h2>
            <p className="text-sm text-white/80">
              Te ayudo a:
            </p>
            <ul className="space-y-1.5 text-sm text-white/80 ml-2">
              <li>🎯 Pickear el campeón óptimo en cada draft</li>
              <li>🚫 Banear lo que más daño te hace en tu línea</li>
              <li>🤖 Coach post-partida para identificar errores</li>
              <li>📊 Ver tu evolución y dónde subir LP</li>
            </ul>
            <div className="bg-bg-card border border-border-subtle rounded p-3 text-xs text-white/70">
              <strong className="text-good">100% privado y seguro:</strong> nada
              sale de tu PC. Usa la API oficial del cliente de LoL —{" "}
              <strong>no es baneable</strong>, no automatiza acciones del juego.
            </div>
            <button
              onClick={handleStart}
              className="w-full py-3 bg-accent text-black font-medium rounded"
            >
              Empezar — detectar cuenta
            </button>
            <button
              onClick={skipToManual}
              className="w-full py-2 text-sm text-white/60 hover:text-white"
            >
              Saltar — usar en modo manual
            </button>
            <p className="text-xs text-white/40 text-center">
              Recomendado: ten el cliente de LoL abierto
            </p>
          </>
        )}

        {step === "level" && (
          <>
            <h2 className="text-xl font-semibold text-accent">¿Qué nivel tienes?</h2>
            <p className="text-sm text-white/70">
              Adapto el contenido a tu experiencia:
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  set("beginnerMode", true);
                  setStep("syncing");
                  handleStart();
                }}
                className="w-full p-3 bg-bg-card border border-border-subtle rounded hover:border-accent text-left"
              >
                <p className="font-medium text-white">🌱 Nuevo / aprendiendo</p>
                <p className="text-xs text-white/60">
                  Explicaciones detalladas, tooltips, tips para cada pick
                </p>
              </button>
              <button
                onClick={() => {
                  set("beginnerMode", false);
                  setStep("syncing");
                  handleStart();
                }}
                className="w-full p-3 bg-bg-card border border-border-subtle rounded hover:border-accent text-left"
              >
                <p className="font-medium text-white">⚔️ Experimentado</p>
                <p className="text-xs text-white/60">
                  UI compacta, datos directos, sin spam de tooltips
                </p>
              </button>
            </div>
          </>
        )}

        {step === "syncing" && (
          <>
            <h2 className="text-xl font-semibold text-accent">Sincronizando...</h2>
            {progress && (
              <>
                <p className="text-sm text-white/80">
                  Fuente: <span className="text-accent">{progress.source}</span>
                </p>
                <p className="text-sm text-white/60">{progress.message}</p>
                {progress.total > 0 && (
                  <div className="w-full bg-bg-card rounded h-2 overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{
                        width: `${(progress.done / progress.total) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </>
            )}
            {!progress && (
              <p className="text-sm text-white/60">Buscando cliente de LoL...</p>
            )}
            <button
              onClick={skipToManual}
              className="w-full py-2 text-sm text-white/60 hover:text-white border border-border-subtle rounded"
            >
              Saltar y usar en modo manual
            </button>
            <p className="text-xs text-white/40 text-center">
              Si tarda más de 10s, el cliente seguramente no está abierto
            </p>
          </>
        )}

        {step === "done" && (
          <>
            <h2 className="text-xl font-semibold text-good">
              ¡Listo!
            </h2>
            <p className="text-sm text-white/80">{summary}</p>
            <div className="bg-bg-card border border-border-subtle rounded p-3 text-xs text-white/70">
              <p className="font-medium text-white mb-1">Próximos pasos:</p>
              <ul className="space-y-1">
                <li>• Entra en champ select para ver sugerencias en tiempo real</li>
                <li>• Tras cada partida, abre <strong>Coach</strong> para revisarla</li>
                <li>• En <strong>Prefs</strong> puedes activar el AI Coach (Claude)</li>
              </ul>
            </div>
            <button
              onClick={handleFinish}
              className="w-full py-3 bg-accent text-black font-medium rounded"
            >
              Empezar a usar la app
            </button>
          </>
        )}
      </div>
    </div>
  );
}
