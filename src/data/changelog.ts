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
  /** Same bullets in English; shown when the app is in English (older
   * entries without it fall back to the Spanish ones). */
  highlightsEn?: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.6.8",
    date: "2026-11-24",
    highlights: [
      "⚔️ Cuando tu rival de línea elige, cada pick te dice cómo va contra él: \"contra Darius ganas 54 de cada 100\" o \"⚠ contra Darius cuesta\"",
      "👥 Modo equipo: con el rival de tu línea ya elegido, salen primero los campeones que encajan con vuestro estilo y además le ganan",
    ],
    highlightsEn: [
      "⚔️ Once your lane rival picks, each pick tells you how it does against them: \"vs Darius you win 54 of 100\" or \"⚠ vs Darius it is hard\"",
      "👥 Team mode: once your lane rival picked, the champions that fit your style and beat them come first",
    ],
  },
  {
    version: "0.6.7",
    date: "2026-11-24",
    highlights: [
      "👥 Modo equipo: si estáis 5 en la sala (Flex, Clash, Reclutamiento o personalizada), elegid un estilo (Engage, Poke, Proteger al carry, Pick o Split) y salen primero los campeones que encajan. La app os sugiere uno con ★",
      "🏠 Inicio: en partidas de jungla, los 3 puntos más importantes del coach en vez de un consejo general",
      "🔊 El aviso de rivales peligrosos (racha, one-trick) ahora suena también en la vista sencilla",
      "👁️ Trinket según tu rol: support cuando tu objeto ya pone wards, jungla en la 1.ª o 2.ª vuelta a base, ADC al nivel 9. Fiddlesticks ya no recibe el aviso",
      "📅 El plan de 7 días se abre en el de esta semana y avisa si no se pudo guardar",
      "🗣️ La IA ya no habla de \"vos\", y un aviso de voz cortado por otro no se repite con la voz de Windows",
    ],
    highlightsEn: [
      "👥 Team mode: with five of you in the lobby (Flex, Clash, normal draft or custom), pick a style (Engage, Poke, Protect the carry, Pick or Split) and the champions that fit come first. The app suggests one with ★",
      "🏠 Home: for jungle games, the coach’s 3 key points instead of a general tip",
      "🔊 The dangerous-rival alert (streak, one-trick) now also plays in the simple view",
      "👁️ Trinket by role: support once your item places wards, jungle on the 1st or 2nd trip to base, ADC at level 9. Fiddlesticks no longer gets the reminder",
      "📅 The 7-day plan opens on this week’s plan and warns if it could not be saved",
      "🗣️ A voice line cut off by another is no longer repeated with the Windows voice",
    ],
  },
  {
    version: "0.6.6",
    date: "2026-11-23",
    highlights: [
      "🧭 Coach: mira dónde jugaste de verdad (si cambiaste de línea, tu rival real) y te dice si ganaste, empataste o perdiste tu línea en el minuto 14",
      "🔎 Si pierdes, el coach te dice por dónde se escapó la partida, con números y sin culpar a nadie",
      "⚔️ Muertes en peleas de equipo contadas aparte, y aviso si entrasteis a pelear con menos gente: no hace falta seguir cada pelea, a veces toca rotar",
      "🛡️ Ya no te dice que compres armadura o resistencia mágica si ya la llevas",
      "🧩 Runas completas (las 9) y objetos del 4.º al 6.º en el plan contra tu rival",
      "👁️ Top y mid: nota suave del trinket después de la partida",
      "🌍 Avisos que salían solo en español, ahora también en inglés",
    ],
    highlightsEn: [
      "🧭 Coach: sees where you really played (lane swaps, your real opponent) and tells you if you won, tied or lost your lane at minute 14",
      "🔎 When you lose, the coach tells you where the game slipped away, with numbers and no blame",
      "⚔️ Team-fight deaths counted apart, and a note when you fought outnumbered: you don’t have to follow every fight, sometimes it’s time to rotate",
      "🛡️ No more “buy armor / magic resist” when you already have it",
      "🧩 Full rune pages (all 9) and 4th to 6th items in the plan against your opponent",
      "👁️ Top and mid: a gentle trinket note after the game",
      "🌍 Alerts that only came in Spanish now come in English too",
    ],
  },
  {
    // 0.6.4 was built only (superseded by 0.6.5): users go 0.6.3 → 0.6.5.
    version: "0.6.5",
    date: "2026-11-23",
    highlights: [
      "🗣️ Voces naturales en español e inglés (Dave y Joe), que se descargan una vez; puedes elegir otra en Preferencias y probarla",
      "👁️ Aviso del trinket: en el minuto 15 el coach te dice por voz que cambies a la Lente del oráculo (support y jungla) o al azul (ADC, desde nivel 9)",
      "📋 Coach de después de la partida: te dice si no cambiaste el trinket, y ahora todo en español e inglés",
      "📈 Tendencias en español e inglés, y el aviso de tu fallo principal con palabras en vez de códigos",
      "🗓️ Planes de 7 días anteriores: ya se pueden abrir enteros",
      "🔒 Tus claves guardadas por versiones antiguas se cifran solas",
      "📊 Opcional: si marcas la casilla, nos llegan los fallos y qué funciones se usan, sin nada personal",
    ],
    highlightsEn: [
      "🗣️ Natural voices in Spanish and English (Dave and Joe), downloaded once; pick another in Preferences and try it",
      "👁️ Trinket reminder: at minute 15 the coach tells you out loud to swap to Oracle Lens (support and jungle) or the blue one (ADC, from level 9)",
      "📋 Post-game coach: tells you if you never swapped your trinket, and now all of it in Spanish and English",
      "📈 Trends in Spanish and English, and your main weak spot named in words instead of codes",
      "🗓️ Past 7-day plans: you can now open them in full",
      "🔒 Keys saved by older versions are encrypted automatically",
      "📊 Optional: if you tick the box, we get errors and which features are used, nothing personal",
    ],
  },
  {
    // 0.6.0–0.6.2 were built but never offered by the updater: users go
    // 0.5.9 → 0.6.3.
    version: "0.6.3",
    date: "2026-11-18",
    highlights: [
      "🏆 Mis campeones (menú Mi juego): todas tus clasificatorias de la temporada, con % de victorias, KDA, súbditos, oro y visión, y cada campeón contra cada rival (Clash aparte)",
      "👥 Tu cuenta se detecta sola: si entras con una smurf, la app cambia a ella y sus partidas no se mezclan con la main",
      "⚙️ Ajustes más simples: idioma, actualizaciones y tu cuenta. Todo lo demás lo hace la app sola",
      "🚫 Baneos de tu línea: si vas a la jungla ya no te propone banear a un main de otra línea",
      "📊 Tu ELO en la portada: liga, división y LP, tus últimas 10 clasificatorias y tu temporada en Solo/Dúo con % de victorias",
      "💬 Botón «Sugerencia / Error» arriba: nos llega de verdad y te avisa si falla",
      "🧠 Coach IA: habla del tema que más pesó en tu partida y no te dice «te costó la partida» cuando ganas",
      "🛒 Objetos: nombres en tu idioma y fuera los que ya no existen en el juego",
      "📡 Si op.gg o la IA se caen, te lo dice claro en vez de fallar callado",
    ],
  },
  {
    version: "0.5.9",
    date: "2026-11-17",
    highlights: [
      "🧠 Coach IA: consejos según tu posición (al jungla le habla de jungla), solo con datos de tu partida y respuestas más estables",
      "⚡ Coach IA: si un modelo está saturado, prueba con otro en vez de fallar",
      "🏅 Tier list: ningún S que pierda, en ninguna lista ni rango",
      "🔒 Más seguro: la IA compartida solo responde a lo que usa la app",
      "🧹 Más ligera: unas 1000 líneas sin uso fuera y memoria de la IA con tope",
    ],
  },
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
