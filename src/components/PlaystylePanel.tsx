import { useEffect, useState } from "react";
import {
  buildPlaystyleProfile,
  getArchetypeMeta,
  type PlaystyleProfile,
} from "../engine/playstyleEngine";
import { recentMatches } from "../services/matchRepo";

export function PlaystylePanel() {
  const [profile, setProfile] = useState<PlaystyleProfile | null>(null);

  useEffect(() => {
    recentMatches(50).then((m) => setProfile(buildPlaystyleProfile(m)));
  }, []);

  if (!profile) return null;
  const meta = getArchetypeMeta(profile.archetype);

  return (
    <div className="space-y-2 p-3 bg-bg-card border border-border-subtle rounded">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{meta.emoji}</span>
        <div>
          <p className="text-xs uppercase text-white/50 tracking-wide">
            Tu estilo
          </p>
          <p className="text-sm font-semibold text-white">{meta.label}</p>
        </div>
      </div>
      <p className="text-xs text-white/70">{meta.tip}</p>
      {profile.traits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile.traits.slice(0, 4).map((t, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 bg-bg-elev border border-border-subtle rounded"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
