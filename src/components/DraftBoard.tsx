import { useState } from "react";
import type { ChampionDb } from "../types/champion";
import { useDraftStore, type Side } from "../state/draftStore";
import { ChampionPicker } from "./ChampionPicker";

interface Props {
  db: ChampionDb;
  lcuConnected?: boolean;
}

export function DraftBoard({ db, lcuConnected = false }: Props) {
  const { ally, enemy, bans, setPick, setBan, reset } = useDraftStore();
  const [picker, setPicker] = useState<
    | { kind: "pick"; side: Side; index: number }
    | { kind: "ban"; side: Side; index: number }
    | null
  >(null);

  const champList = Object.values(db.champions);
  const allTaken = [
    ...ally.map((s) => s.championKey),
    ...enemy.map((s) => s.championKey),
    ...bans.ally,
    ...bans.enemy,
  ].filter((x): x is string => Boolean(x));

  return (
    <div className="grid grid-cols-2 gap-4">
      <SideColumn
        title="Tu equipo"
        side="ally"
        slots={ally}
        bans={bans.ally}
        db={db}
        onPickClick={(i) => setPicker({ kind: "pick", side: "ally", index: i })}
        onBanClick={(i) => setPicker({ kind: "ban", side: "ally", index: i })}
      />
      <SideColumn
        title="Enemigos"
        side="enemy"
        slots={enemy}
        bans={bans.enemy}
        db={db}
        onPickClick={(i) =>
          setPicker({ kind: "pick", side: "enemy", index: i })
        }
        onBanClick={(i) => setPicker({ kind: "ban", side: "enemy", index: i })}
      />

      {!lcuConnected && (
        <div className="col-span-2 flex justify-end">
          <button
            onClick={reset}
            className="text-xs text-white/40 hover:text-white/80 px-2 py-1 rounded transition"
          >
            Reiniciar draft
          </button>
        </div>
      )}

      {picker && (
        <ChampionPicker
          champions={champList}
          excludeKeys={allTaken}
          onPick={(c) => {
            if (picker.kind === "pick") setPick(picker.side, picker.index, c.key);
            else setBan(picker.side, picker.index, c.key);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

interface SideColumnProps {
  title: string;
  side: Side;
  slots: ReturnType<typeof useDraftStore.getState>["ally"];
  bans: string[];
  db: ChampionDb;
  onPickClick: (i: number) => void;
  onBanClick: (i: number) => void;
}

function SideColumn({
  title,
  slots,
  bans,
  db,
  onPickClick,
  onBanClick,
}: SideColumnProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm uppercase tracking-wide text-white/50">{title}</h3>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => {
          const key = bans[i];
          const champ = key ? db.champions[key] : null;
          return (
            <button
              key={i}
              onClick={() => onBanClick(i)}
              className="w-8 h-8 rounded-full bg-bg-card border border-border-subtle overflow-hidden grayscale opacity-70 hover:opacity-100"
              title={champ?.name ?? `Ban ${i + 1}`}
            >
              {champ ? (
                <img src={champ.iconUrl} alt={champ.name} className="w-full h-full" />
              ) : (
                <span className="text-xs text-white/30">✕</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        {slots.map((slot) => {
          const champ = slot.championKey ? db.champions[slot.championKey] : null;
          return (
            <button
              key={slot.index}
              onClick={() => onPickClick(slot.index)}
              className="w-full flex items-center gap-3 bg-bg-card hover:bg-bg-elev border border-border-subtle rounded p-2 transition"
            >
              <div className="w-12 h-12 rounded bg-bg overflow-hidden border border-border-subtle">
                {champ && (
                  <img src={champ.iconUrl} alt={champ.name} className="w-full h-full" />
                )}
              </div>
              <div className="text-left flex-1">
                <p className="text-sm text-white">
                  {champ ? champ.name : `Slot ${slot.index + 1}`}
                </p>
                {champ && (
                  <p className="text-xs text-white/50">{champ.title}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
