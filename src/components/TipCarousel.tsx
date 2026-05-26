// Pre-game tip carousel. Cycles through 3-5 short champion-specific
// tips during champ select, drawn from the curated `championTips` map.
// Replaces dead space in the right rail with actionable advice that
// rotates every ~6 seconds so the user catches multiple tips while
// they're picking spells / staring at the queue.
//
// All tips are static — no API call, no AI cost. Curated for ~30 most
// common picks per archetype with a generic fallback per role.

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Panel } from "./ui/Panel";
import type { Champion, Role } from "../types/champion";

interface Props {
  champion: Champion | null;
  role: Role | null;
}

// Per-champion tips. Add more as we see specific user demand. Each entry
// is a short imperative ("Q max first") so the user can scan quickly.
const CHAMPION_TIPS: Record<string, string[]> = {
  "Lee Sin": [
    "Insec hacia tu equipo, no contra el muro — saca al carry de posición.",
    "Q max para mejor wave-clear y prio temprana.",
    "Ward jump pa salida tras gankear — ahorra Flash.",
  ],
  "Jinx": [
    "Cambia AA → MiniGun antes de teamfight para movilidad.",
    "Trampas en flank routes — info gratis pa peelers.",
    "Resets de Q garantizan persecución infinita — busca picks.",
  ],
  "Yasuo": [
    "Espera engage aliado pa tu ulti — no malgastes Knockup propio.",
    "E sobre minions caster pa esquivar habilidades en lane.",
    "Wind Wall sólo proyectiles — no para AA, no para dashes.",
  ],
  "Ahri": [
    "E → Q → AA → R, no R first salvo escape.",
    "Roam side opuesto a jungle prio.",
    "Q charm en wave management hace push fácil.",
  ],
  "Vayne": [
    "Tumble cancela animación de AA — usa entre cada auto en trades.",
    "Condemn al carry contra muro = kill garantizado.",
    "Stack Q passive antes de engage — daño verdadero compensa squishy.",
  ],
};

// Per-role generic tips when champion has no specific entry.
const ROLE_TIPS: Record<Role, string[]> = {
  TOP: [
    "Ward Tri-bush + river — gank desde river es lo más común a 3min.",
    "TP debe gastarse en kill o cancelando gank, no en push.",
    "Freeze cerca de tu torre si vas detrás — niega gank enemigo.",
  ],
  JUNGLE: [
    "Track buff enemigo — clear inicial revela su path.",
    "Ataca lanes que ganan trades — gank perdiendo lane = 50/50.",
    "Si pierdes farm, juega gankeo + objetivos pa generar valor.",
  ],
  MIDDLE: [
    "Wave management: empuja antes de roam, congela tras kill.",
    "Roam botlane minuto 5-9 — más feed potencial que top.",
    "Track jungla enemiga — su CD = tu ventana de all-in.",
  ],
  BOTTOM: [
    "Trade tras maná soporte — solo Soporte tiene barras.",
    "Last hit es prioridad #1 — daño cero en lane si CS bajo.",
    "Reset windows en oleadas largas + post-back.",
  ],
  UTILITY: [
    "Roam tras pushear oleada — Q&A invisible al enemy.",
    "Ward tribush minuto 2:50 — invades, dragones, fastclear.",
    "Posiciona BEHIND tu ADC en teamfights — peel > engage para enchanters.",
  ],
};

function getTipsFor(champion: Champion | null, role: Role | null): string[] {
  if (!role && !champion) return [];
  const tips: string[] = [];
  if (champion && CHAMPION_TIPS[champion.name]) {
    tips.push(...CHAMPION_TIPS[champion.name]);
  }
  if (role && ROLE_TIPS[role]) {
    tips.push(...ROLE_TIPS[role]);
  }
  return tips;
}

const ROTATE_MS = 6000;

export function TipCarousel({ champion, role }: Props) {
  const tips = getTipsFor(champion, role);
  const [idx, setIdx] = useState(0);

  // Rotate every ROTATE_MS so the user sees multiple tips per pick phase.
  // Resets to 0 when champion/role changes so the new context starts fresh.
  useEffect(() => {
    setIdx(0);
  }, [champion?.key, role]);

  useEffect(() => {
    if (tips.length <= 1) return;
    const id = setInterval(() => {
      setIdx((n) => (n + 1) % tips.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
    // Re-trigger when champion/role changes so the interval restarts
    // with the NEW tips array. Previously only tips.length was in the
    // dep array — if length stayed equal across champions, the
    // interval's closure kept using the old tips reference + indexed
    // stale content for `current = tips[idx]`.
  }, [tips.length, champion?.key, role]);

  if (tips.length === 0) return null;
  const current = tips[idx];

  return (
    <Panel padding="sm">
      <div className="flex items-start gap-2">
        <Lightbulb className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
              Tip · {champion?.name ?? role}
            </p>
            {tips.length > 1 && (
              <span className="text-[9px] text-white/35 tabular-nums">
                {idx + 1}/{tips.length}
              </span>
            )}
          </div>
          {/* key on the text ensures CSS transition triggers per tip
            * change — fade-in animation defined in App.css. */}
          <p
            key={`${champion?.name ?? "r"}-${idx}`}
            className="text-[11px] text-white/85 leading-snug animate-[fadeIn_300ms_ease-out]"
          >
            {current}
          </p>
        </div>
      </div>
      {/* Progress bar showing time until rotate */}
      {tips.length > 1 && (
        <div className="mt-2 h-0.5 bg-white/5 rounded overflow-hidden">
          <div
            key={`bar-${idx}`}
            className="h-full bg-accent/60"
            style={{
              animation: `slideUp 1ms linear forwards, fadeIn 0ms`,
              transition: `width ${ROTATE_MS}ms linear`,
              width: "100%",
            }}
          />
        </div>
      )}
    </Panel>
  );
}
