// Hand-curated changelog. Surfaced once after each install/update via
// <ChangelogModal>. Update this file every release alongside the version
// bump in package.json — same commit. Keep entries terse: 5-8 bullets
// max per release, user-facing only (no refactor noise).
//
// Order: NEWEST first. The modal shows the entry matching the running
// `__APP_VERSION__`; older entries are visible if the user scrolls in
// the "Historial" view (future).

export interface ChangelogEntry {
  version: string;
  date: string; // ISO YYYY-MM-DD
  highlights: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.5.0",
    date: "2026-11-12",
    highlights: [
      "🧭 Pantalla sencilla nueva: qué banear, qué elegir y qué comprar, sin jerga",
      "🎮 En partida: qué hacer ahora, qué comprar y con qué rivales tener cuidado",
      "🏠 Inicio: resumen de tu última partida y una cosa para mejorar",
      "🛒 Plan de compra por tu rival de línea y por todo el equipo enemigo",
      "🕵️ Análisis de rivales también en clasificatorias, desde la pantalla de carga",
      "🔎 El buscador encuentra nombres con letras raras (Ð, Λ, Σ…)",
      "🔧 Más de 60 arreglos en consejos, runas, objetos y datos",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-05-21",
    highlights: [
      "🛡️ Backups automáticos rotatorios (5 días) antes de cada arranque",
      "🔁 Reintentos exponenciales en fetches críticos (op.gg, dpm.lol, DDragon)",
      "🎯 Overlay anclado a ventana LoL + Win32 topmost re-asserted (parity Mobalytics)",
      "📊 Diagnóstico paralelo + reporte copiable para soporte",
      "✅ Detección modo ventana LoL + aviso si fullscreen-exclusive",
      "🔐 Aviso legal versionado + opt-in telemetría (GDPR)",
      "📥 Backup/restore manual SQLite + auto-restart 1-click",
      "🪟 Auto-start con Windows + system tray",
    ],
  },
];

/** Find the changelog entry for a given version. Returns null when no
 * curated entry exists yet (recent build, no notes prepared). */
export function getChangelogFor(version: string): ChangelogEntry | null {
  return CHANGELOG.find((e) => e.version === version) ?? null;
}
