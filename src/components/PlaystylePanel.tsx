import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildPlaystyleProfile,
  getArchetypeMeta,
  type PlaystyleProfile,
} from "../engine/playstyleEngine";
import { recentMatches } from "../services/matchRepo";
import { Panel } from "./ui/Panel";
import { Compass } from "lucide-react";

// playstyleEngine emits its traits as Spanish text; map each to an i18n id so
// the panel follows the UI language. An unmapped trait is shown as-is.
const TRAIT_IDS: Record<string, string> = {
  "Alta presión de kills": "highKills",
  "Mueres mucho — riesgo alto": "highDeaths",
  "Muy seguro, casi no mueres": "lowDeaths",
  "Excelente farm": "greatFarm",
  "Farm bajo": "lowFarm",
  "KDA alto consistente": "highKda",
  "Tendencia a partidas largas": "longGames",
  "Cierra rápido": "fastGames",
  "Asistencias > kills (peeler/playmaker)": "assistHeavy",
  "Solo carry, kills > assists": "killHeavy",
};

export function PlaystylePanel() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<PlaystyleProfile | null>(null);

  useEffect(() => {
    recentMatches(50).then((m) => setProfile(buildPlaystyleProfile(m)));
  }, []);

  if (!profile) return null;
  const meta = getArchetypeMeta(profile.archetype);
  const label = t(`playstyle.archetypes.${profile.archetype}.label`);

  return (
    <Panel
      padding="sm"
      collapsible
      defaultOpen={false}
      storageKey="playstyle"
      icon={<Compass className="w-3 h-3" />}
      title={t("playstyle.title")}
      summary={label}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl leading-none">{meta.emoji}</span>
        <p className="text-sm font-semibold text-white">{label}</p>
      </div>
      <p className="text-[11px] text-white/65 leading-relaxed">
        {t(`playstyle.archetypes.${profile.archetype}.tip`)}
      </p>
      {profile.traits.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {profile.traits.slice(0, 4).map((trait, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 bg-bg-card/60 ring-1 ring-border-subtle rounded-full text-white/65"
            >
              {TRAIT_IDS[trait] ? t(`playstyle.traits.${TRAIT_IDS[trait]}`) : trait}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
