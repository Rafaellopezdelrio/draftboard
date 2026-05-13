import { useEffect, useState } from "react";
import type { ChampionDb, Role } from "../types/champion";
import {
  personalMatchupsByRole,
  type PersonalMatchupStat,
} from "../services/matchRepo";
import { suggestBans, type BanSuggestion } from "../engine/banEngine";
import { Panel, PanelHeader } from "./ui/Panel";
import { Ban } from "lucide-react";

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
      <Panel padding="sm">
        <PanelHeader icon={<Ban className="w-3 h-3" />} title="Bans sugeridos" />
        <p className="text-[11px] text-white/40 italic">
          Selecciona tu rol para ver bans.
        </p>
      </Panel>
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
    <Panel padding="sm">
      <PanelHeader
        icon={<Ban className="w-3 h-3" />}
        title="Bans sugeridos"
        subtitle={role}
      />
      {suggestions.length === 0 ? (
        <p className="text-[11px] text-white/40 italic">
          Sin datos suficientes en {role} aún.
        </p>
      ) : (
        <div className="space-y-1.5">
          {suggestions.map((s) => (
            <BanCard key={s.championKey} s={s} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function BanCard({ s }: { s: BanSuggestion }) {
  const colors = {
    high: "ring-bad/50 bg-bad/5",
    medium: "ring-meh/50 bg-meh/5",
    low: "ring-border-subtle bg-bg-card/50",
  };
  const tagColors = {
    personal: "bg-bad/15 text-bad ring-bad/30",
    global: "bg-meh/15 text-meh ring-meh/30",
    blend: "bg-accent/15 text-accent ring-accent/30",
  };
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded ring-1 ${colors[s.severity]}`}
    >
      <div className="relative">
        <img
          src={s.iconUrl}
          alt={s.championName}
          className="w-8 h-8 rounded grayscale"
        />
        <Ban className="absolute inset-0 m-auto w-4 h-4 text-bad/80 opacity-90" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white font-medium truncate">{s.championName}</p>
        <p className="text-[11px] text-white/65 truncate">{s.reason}</p>
      </div>
      <span
        className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ring-1 ${tagColors[s.source]}`}
      >
        {s.source === "personal" ? "tú" : "meta"}
      </span>
    </div>
  );
}
