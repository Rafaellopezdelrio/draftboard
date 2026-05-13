import { useEffect, useState } from "react";
import {
  buildPlaystyleProfile,
  getArchetypeMeta,
  type PlaystyleProfile,
} from "../engine/playstyleEngine";
import { recentMatches } from "../services/matchRepo";
import { Panel, PanelHeader } from "./ui/Panel";
import { Compass } from "lucide-react";

export function PlaystylePanel() {
  const [profile, setProfile] = useState<PlaystyleProfile | null>(null);

  useEffect(() => {
    recentMatches(50).then((m) => setProfile(buildPlaystyleProfile(m)));
  }, []);

  if (!profile) return null;
  const meta = getArchetypeMeta(profile.archetype);

  return (
    <Panel padding="sm">
      <PanelHeader icon={<Compass className="w-3 h-3" />} title="Tu estilo" />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl leading-none">{meta.emoji}</span>
        <p className="text-sm font-semibold text-white">{meta.label}</p>
      </div>
      <p className="text-[11px] text-white/65 leading-relaxed">{meta.tip}</p>
      {profile.traits.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {profile.traits.slice(0, 4).map((t, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 bg-bg-card/60 ring-1 ring-border-subtle rounded-full text-white/65"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
