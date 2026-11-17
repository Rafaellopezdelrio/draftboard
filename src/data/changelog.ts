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
    version: "0.5.8",
    date: "2026-11-17",
    highlights: [
      "🏅 Tier list más fiable: para ser S hay que ganar de verdad, no solo ser popular (Lee Sin deja de ser S en Challenger)",
      "🌲 Cho'Gath y Qiyana en la jungla vuelven a salir en la lista y en las recomendaciones",
      "📈 Tendencias en palabras claras («X cuando ganas · Y cuando pierdes») y ya no se sale de la ventana",
      "🛠️ Builds: primero la más jugada, no una de 2 partidas con «100 %»",
      "🌍 Ajustes: icono propio para «mejores jugadores» y textos sin jerga",
      "🧪 Más fiable por dentro: pruebas nuevas que ya han cazado un fallo",
    ],
  },
  {
    version: "0.5.7",
    date: "2026-11-17",
    highlights: [
      "📊 La lista de mejores campeones vuelve a ir por rango: elige el tuyo y verás la de tu nivel, con datos de op.gg",
      "🏅 Notas más claras: unas 5 S por posición en vez de media lista, y aviso de «pocos datos» cuando hay pocas partidas",
      "🎯 Al elegir campeón manda la partida: entre los que juegas, gana el que mejor encaja contra lo que tienen enfrente",
      "🧠 Lee al equipo enemigo: si se lanzan, si castigan de lejos, si llevan asesinos; y el daño de tu propio equipo",
      "✨ «Mejor para esta partida»: si hay un campeón claramente mejor que no juegas, te lo enseña aparte",
      "🕰️ Un campeón que dejaste hace meses ya no sale el primero solo por tu maestría",
    ],
  },
  {
    version: "0.5.6",
    date: "2026-11-17",
    highlights: [
      "🔔 La app avisa de versiones nuevas aunque la tengas abierta: mira cada 30 minutos",
      "🏆 «Actualizar con los mejores jugadores»: baja las partidas de los 100 mejores de Corea y de Europa, solo clasificatorias, en unos 25 minutos",
      "⏳ Las descargas largas siguen aunque cierres Ajustes: abajo ves por dónde van y avisan al terminar",
      "✨ Al terminar una descarga, los datos nuevos entran solos: ya no hay que recargar la app",
      "🛑 Ya no se pueden lanzar dos descargas a la vez por error",
    ],
  },
  {
    version: "0.5.5",
    date: "2026-11-16",
    highlights: [
      "🏆 Los datos de profesionales vienen ahora de la fuente oficial de Riot (GRID): más completos y al día",
      "🪪 Recién instalada ya funciona todo: reconoce tu cuenta sola desde el LoL abierto, sin pasar por ajustes",
      "🎓 El entrenador tras la partida, la partida en vivo y la info de rivales ya no piden «configura tu Riot ID»",
      "🤖 La IA viene activada de serie",
      "🌍 Buscar jugadores usa la región de tu LoL, no siempre Europa Oeste",
      "💬 Errores y textos más claros: un solo aviso si el servidor falla, sin códigos raros",
      "🧩 Modo sencillo: «faltan X elecciones» cuenta bien, el tablero se limpia al acabar y todo sale en español",
    ],
  },
  {
    version: "0.5.4",
    date: "2026-11-13",
    highlights: [
      "📊 Tier list: ya no aparenta cambiar por rango cuando no hay datos por rango; lo dice claro",
      "🧹 Fuera un contador en inglés que no servía para nada",
    ],
  },
  {
    version: "0.5.3",
    date: "2026-11-12",
    highlights: [
      "🪪 Tu Riot ID se encuentra aunque tenga letras raras (Ð, Λ, Σ…)",
      "✍️ Puedes escribir «Nombre#TAG» de una vez o poner «#» en la etiqueta: lo entiende igual",
      "🔑 Ya no parece que tengas que conseguir una clave de Riot: no hace falta",
      "🕵️ El aviso «su rival juega mucho este campeón» ya funciona para todos",
      "💬 Mensajes de error más claros cuando algo falla con Riot",
    ],
  },
  {
    version: "0.5.2",
    date: "2026-11-12",
    highlights: [
      "🎯 Ya salen los counters: «bueno contra sus campeones» y «rival difícil en tu línea»",
      "📈 Selección: tus opciones de ganar, qué le falta a tu equipo y aviso si un rival juega mucho su campeón",
      "🧩 Prepara: runas, hechizos y qué habilidad subir, con un botón para ponerlos en el juego",
      "🗺️ «Cómo ganáis»: el plan de la partida en dos frases sencillas",
      "👆 Toca a un enemigo para decir que es tu rival de línea",
      "💰 En partida: cómo va cada línea en oro",
      "🔧 Los iconos de runas se recuperan solos si fallan al abrir la app",
    ],
  },
  {
    version: "0.5.1",
    date: "2026-11-12",
    highlights: [
      "💬 El coach explica con detalle pero fácil: el porqué de cada cosa, sin cuentas ni símbolos raros",
      "📝 Las respuestas de la IA se ven bien: negritas y listas, sin asteriscos",
      "⚙️ Configuración con textos sencillos, sin jerga técnica",
      "🧭 Ya no confunde la posición de una partida (p. ej. Ahri en medio contada como top)",
      "🏠 El inicio muestra tus partidas en cuanto se descargan",
      "🛠️ Corregida una errata en el instalador",
    ],
  },
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
