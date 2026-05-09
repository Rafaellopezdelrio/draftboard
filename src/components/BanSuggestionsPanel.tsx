import { useEffect, useState } from "react";
import type { ChampionDb, Role } from "../types/champion";
import {
  personalMatchupsByRole,
  type PersonalMatchupStat,
} from "../services/matchRepo";
import { suggestBans, type BanSuggestion } from "../engine/banEngine";

interface Props {
  db: ChampionDb;
  role: Role | null;
  bannedKeys: string[];
  pickedKeys: string[];
}

export function BanSuggestionsPanel({
  db,
  role,
  bannedKeys,
  pickedKeys,
}: Props) {
  const [matchups, setMatchups] = useState<PersonalMatchupStat[]>([]);

  useEffect(() => {
    if (!role) {
      setMatchups([]);
      return;
    }
    personalMatchupsByRole(role).then(setMatchups);
  }, [role]);

  if (!role) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm uppercase tracking-wide text-white/50">
          Bans sugeridos
        </h3>
        <p className="text-xs text-white/40">Selecciona tu rol para ver bans.</p>
      </div>
    );
  }

  const suggestions = suggestBans({
    db,
    role,
    matchups,
    bannedKeys,
    pickedKeys,
    limit: 5,
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm uppercase tracking-wide text-white/50">
        Bans sugeridos · {role}
      </h3>
      {suggestions.length === 0 ? (
        <p className="text-xs text-white/40">
          Sin datos suficientes en {role} aún.
        </p>
      ) : (
        suggestions.map((s) => <BanCard key={s.championKey} s={s} />)
      )}
    </div>
  );
}

function BanCard({ s }: { s: BanSuggestion }) {
  const colors = {
    high: "border-bad/60 bg-bad/10",
    medium: "border-meh/60 bg-meh/10",
    low: "border-border-subtle bg-bg-card",
  };
  const tagColors = {
    personal: "text-bad",
    global: "text-meh",
    blend: "text-accent",
  };
  return (
    <div className={`flex items-center gap-2 p-2 rounded border ${colors[s.severity]}`}>
      <img src={s.iconUrl} alt={s.championName} className="w-9 h-9 rounded grayscale" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{s.championName}</p>
        <p className="text-xs text-white/70">{s.reason}</p>
      </div>
      <span
        className={`text-[10px] uppercase ${tagColors[s.source]} font-medium`}
      >
        {s.source === "personal" ? "tu" : "meta"}
      </span>
    </div>
  );
}
