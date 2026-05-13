import { useState } from "react";
import type { ChampionDb } from "../types/champion";
import { useDraftStore, type Side } from "../state/draftStore";
import { ChampionPicker } from "./ChampionPicker";
import { Plus, Ban, Shield, Swords, RotateCcw } from "lucide-react";

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

  const hasAnyPick = ally.some((s) => s.championKey) || enemy.some((s) => s.championKey) || bans.ally.length > 0 || bans.enemy.length > 0;

  return (
    <div className="grid grid-cols-2 gap-3">
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

      {!lcuConnected && hasAnyPick && (
        <div className="col-span-2 flex justify-center pt-1">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white px-3 py-1.5 rounded-md ring-1 ring-border-subtle hover:ring-bad/50 hover:bg-bad/5 transition"
          >
            <RotateCcw className="w-3 h-3" />
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
  side,
  slots,
  bans,
  db,
  onPickClick,
  onBanClick,
}: SideColumnProps) {
  const isAlly = side === "ally";
  const accentRing = isAlly ? "ring-accent/30" : "ring-bad/30";
  const accentText = isAlly ? "text-accent" : "text-bad";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        {isAlly ? (
          <Shield className={`w-3.5 h-3.5 ${accentText}`} />
        ) : (
          <Swords className={`w-3.5 h-3.5 ${accentText}`} />
        )}
        <h3 className={`text-[11px] uppercase tracking-widest font-semibold ${accentText}`}>
          {title}
        </h3>
      </div>

      {/* Bans row */}
      <div className="flex gap-1 px-1">
        {Array.from({ length: 5 }).map((_, i) => {
          const key = bans[i];
          const champ = key ? db.champions[key] : null;
          return (
            <button
              key={i}
              onClick={() => onBanClick(i)}
              className="relative w-7 h-7 rounded-full bg-bg-card ring-1 ring-border-subtle overflow-hidden hover:ring-bad/60 transition"
              title={champ?.name ?? `Ban ${i + 1}`}
            >
              {champ ? (
                <>
                  <img
                    src={champ.iconUrl}
                    alt={champ.name}
                    className="w-full h-full grayscale opacity-70"
                  />
                  <Ban className="absolute inset-0 m-auto w-3.5 h-3.5 text-bad/90" />
                </>
              ) : (
                <Ban className="w-3 h-3 text-white/20 m-auto" />
              )}
            </button>
          );
        })}
      </div>

      {/* Pick slots */}
      <div className="space-y-1.5">
        {slots.map((slot) => {
          const champ = slot.championKey ? db.champions[slot.championKey] : null;
          return (
            <button
              key={slot.index}
              onClick={() => onPickClick(slot.index)}
              className={`w-full flex items-center gap-2.5 bg-bg-card/60 hover:bg-bg-card ring-1 ${
                champ ? accentRing : "ring-border-subtle"
              } hover:ring-accent/50 rounded-md p-2 transition group`}
            >
              <div className="w-11 h-11 rounded bg-bg-elev overflow-hidden ring-1 ring-border-subtle group-hover:ring-accent/40 flex items-center justify-center transition">
                {champ ? (
                  <img
                    src={champ.iconUrl}
                    alt={champ.name}
                    className="w-full h-full"
                  />
                ) : (
                  <Plus className="w-4 h-4 text-white/25" />
                )}
              </div>
              <div className="text-left flex-1 min-w-0">
                {champ ? (
                  <>
                    <p className="text-sm text-white font-medium truncate">
                      {champ.name}
                    </p>
                    <p className="text-[11px] text-white/50 truncate">
                      {champ.title}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-white/40 italic">Slot vacío</p>
                    <p className="text-[10px] text-white/25 uppercase tracking-widest">
                      pickear · {slot.index + 1}
                    </p>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
