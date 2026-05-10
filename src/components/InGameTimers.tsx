// Static reference timers shown when a game is in progress.
// We don't read in-game state (Vanguard risk), just static spawn schedules.

interface Timer {
  name: string;
  firstSpawnSec: number;
  respawnSec: number;
  icon: string;
  color: string;
}

const TIMERS: Timer[] = [
  { name: "Drake", firstSpawnSec: 5 * 60, respawnSec: 5 * 60, icon: "🐉", color: "text-good" },
  { name: "Herald", firstSpawnSec: 14 * 60, respawnSec: 6 * 60, icon: "👁️", color: "text-meh" },
  { name: "Baron", firstSpawnSec: 25 * 60, respawnSec: 6 * 60, icon: "💀", color: "text-bad" },
  { name: "Atakhan", firstSpawnSec: 20 * 60, respawnSec: 0, icon: "👑", color: "text-accent" },
];

export function InGameTimers() {
  return (
    <div className="space-y-2 p-3 bg-bg-elev border border-border-subtle rounded">
      <h3 className="text-sm uppercase tracking-wide text-accent">
        🎮 Partida en curso — referencias
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {TIMERS.map((t) => (
          <div
            key={t.name}
            className="bg-bg-card rounded p-2 border border-border-subtle"
          >
            <p className={`text-sm font-medium ${t.color}`}>
              {t.icon} {t.name}
            </p>
            <p className="text-xs text-white/60">
              1ª spawn: {Math.round(t.firstSpawnSec / 60)}min
            </p>
            {t.respawnSec > 0 && (
              <p className="text-xs text-white/60">
                Respawn: {Math.round(t.respawnSec / 60)}min
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-white/40">
        💡 Wardea río 30s antes del spawn. Empuja waves laterales primero.
      </p>
    </div>
  );
}
