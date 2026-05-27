// Generate Draftboard TODO checklist docx. Format: checkbox per item
// so the user can tick off and report back. Run: node draftboard-todo.cjs
const fs = require("fs");
const path = require("path");

const docxPath = path.join("C:", "Users", "rafae", "AppData", "Roaming", "npm", "node_modules", "docx");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  BorderStyle,
  WidthType,
  ShadingType,
  PageNumber,
  Header,
  Footer,
} = require(docxPath);

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 100 },
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text })],
  });
}

// Checkbox item: empty box + bold short label + thin description.
// Used over bullets so user can tick on the printed/screen copy.
function todo(label, detail = "", risk = "") {
  const children = [
    new TextRun({ text: "☐  ", size: 28, bold: true }),
    new TextRun({ text: label, bold: true }),
  ];
  if (risk) {
    const colorByRisk = { bajo: "0F7B0F", medio: "B7950B", alto: "C00000" };
    children.push(
      new TextRun({
        text: `  [${risk}]`,
        bold: true,
        color: colorByRisk[risk] || "808080",
        size: 18,
      })
    );
  }
  if (detail) {
    children.push(new TextRun({ text: ` — ${detail}`, color: "595959" }));
  }
  return new Paragraph({
    children,
    spacing: { after: 140 },
    indent: { left: 200 },
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    borders,
    width: { size: opts.width || 2340, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, color: opts.color })],
      }),
    ],
  });
}

function table(columnWidths, rows) {
  const tableWidth = columnWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    rows: rows.map((row) => new TableRow({ children: row })),
  });
}

// ─────────────────────────────────────────────────────────
// Document content
// ─────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);

const sections = [
  // TITLE
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1800, after: 200 },
    children: [
      new TextRun({ text: "Draftboard TODO", size: 60, bold: true, color: "1F4E79" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({ text: "Checklist accionable de debilidades pendientes", size: 26, color: "595959" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: today, size: 20, color: "808080", italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [
      new TextRun({
        text: "Tacha ☐ → ✓ cuando completes. Cada item marca [bajo/medio/alto] risk.",
        size: 20,
        color: "404040",
        italics: true,
      }),
    ],
  }),
  new Paragraph({ children: [new TextRun({ text: "", break: 1 })] }),

  // ═══════════════════════════════════════════════════════
  // 1. SNAPSHOT ACTUAL
  // ═══════════════════════════════════════════════════════
  h1("1. Snapshot actual"),
  table(
    [2700, 1500, 1500, 1500, 1860],
    [
      [
        cell("Archivo", { bold: true, fill: "D5E8F0" }),
        cell("Inicio", { bold: true, fill: "D5E8F0" }),
        cell("Hoy", { bold: true, fill: "D5E8F0" }),
        cell("Δ", { bold: true, fill: "D5E8F0" }),
        cell("Estado", { bold: true, fill: "D5E8F0" }),
      ],
      [cell("BuildPanel.tsx"), cell("1300+"), cell("343"), cell("-74%", { color: "0F7B0F" }), cell("✓ done")],
      [cell("PreferencesView.tsx"), cell("858"), cell("197"), cell("-77%", { color: "0F7B0F" }), cell("✓ done")],
      [cell("lib.rs"), cell("1003"), cell("267"), cell("-73%", { color: "0F7B0F" }), cell("✓ done")],
      [cell("worker.js"), cell("1719"), cell("1098"), cell("-36%", { color: "B7950B" }), cell("◐ Sprint 2 done, Sprint 3 pending")],
      [cell("App.tsx"), cell("1230+"), cell("925"), cell("-25%", { color: "B7950B" }), cell("◐ posible Sprint 3 hooks")],
      [cell("lcu.rs"), cell("991"), cell("842"), cell("-15%", { color: "C00000" }), cell("✗ split alto risk")],
    ]
  ),
  p(""),
  p("Tests verde: 669 frontend + 15 Rust + 46 CF Worker = 730 total.", { italics: true }),

  // ═══════════════════════════════════════════════════════
  // 2. BUGS CONOCIDOS
  // ═══════════════════════════════════════════════════════
  h1("2. Bugs conocidos pendientes"),

  h2("Críticos"),
  todo(
    "Blind pick detection roto",
    "myCell sin championId ni championPickIntent en blind pick. Espera captura draftboard.log de sesión real para parsear actions[][] en lugar de myTeam[].championId.",
    "alto"
  ),

  h2("Menores"),
  todo(
    "TierListView force-refresh tras meta-source change",
    "Verificar que setDb expuesto desde useChampionDbBoot funciona end-to-end (cambia dpm bracket -> tier list actualiza sin restart).",
    "bajo"
  ),
  todo(
    "Live ban derivation regression en surrender vote",
    "Cuando equipo aliado vota surrender en champ select y queda en 'preparing', verificar que bans no se borran con setBan(null).",
    "bajo"
  ),

  // ═══════════════════════════════════════════════════════
  // 3. SPRINT CORTO (low risk, sub-2h)
  // ═══════════════════════════════════════════════════════
  h1("3. Sprint corto — low risk, <2h cada uno"),

  h2("DX / Build"),
  todo(
    "Husky pre-commit hook",
    "Lint + typecheck + cargo fmt --check antes de commit. Bloquea push de código roto. npm install -D husky lint-staged.",
    "bajo"
  ),
  todo(
    "Dependabot config",
    ".github/dependabot.yml para npm + cargo + github-actions. Bumps semver-safe weekly.",
    "bajo"
  ),
  todo(
    "GitHub Actions matrix Windows + Linux",
    "Tauri builds en ambos OS. Cargo + vitest + tsc. Bloquea PR rojo.",
    "bajo"
  ),
  todo(
    "Renovate config (alternativa Dependabot)",
    "Más granular, agrupa updates. Decide uno u otro, no ambos.",
    "bajo"
  ),

  h2("App.tsx — extracts finales"),
  todo(
    "Memoized derivations a hook",
    "useDraftDerivations: allyKeys, enemyKeys, enemyChampionIds, bannedKeys (~30 LOC). Returns objeto memoizado.",
    "bajo"
  ),
  todo(
    "Suggestion engine call a hook",
    "useSuggestions({ db, role, allyKeys, enemyKeys, ...}). Encapsula useMemo + dependencias engine.",
    "bajo"
  ),
  todo(
    "Draft prediction call a hook",
    "useDraftPrediction({ db, allyKeys, enemyKeys }). Mismo patrón.",
    "bajo"
  ),

  h2("Worker.js — Sprint 3 helpers"),
  todo(
    "Extraer DPM filter -> scrapers/dpm.js",
    "DPM_TIERS, DPM_PLATFORMS, DPM_TIMEFRAMES, handleDpmTierList logic. ~135 LOC, test cubre.",
    "bajo"
  ),
  todo(
    "Extraer op.gg matchups -> scrapers/opggMatchups.js",
    "extractOpggMatchups + OPGG_MATCHUP_ROLES/TIERS. ~180 LOC, test cubre.",
    "bajo"
  ),
  todo(
    "Extraer parseLane -> scrapers/opggTier.js",
    "parseLane + handleOpggTierList. ~110 LOC.",
    "bajo"
  ),

  // ═══════════════════════════════════════════════════════
  // 4. SPRINT MEDIO
  // ═══════════════════════════════════════════════════════
  h1("4. Sprint medio — medium risk, ~4h cada uno"),

  h2("Testing infra"),
  todo(
    "Storybook setup + 10 stories UI primitivos",
    "Logo, Toast, Skeleton, ConfirmDialog, HelpTip, HeaderMenu, AppFooter, Toggle, TipCarousel, TrackingStatusBar.",
    "medio"
  ),
  todo(
    "Playwright config + 3 E2E smoke tests",
    "Boot app -> see header / open modal / Ctrl+K palette. Headless en CI.",
    "medio"
  ),
  todo(
    "Vitest coverage report en CI",
    "@vitest/coverage-v8 + badge en README. Targetshold 70%.",
    "medio"
  ),
  todo(
    "Snapshot tests Sentry PII scrub",
    "Inputs con Riot ID / API key / Windows username -> output sin ellos. Regression-proof beforeSend.",
    "medio"
  ),

  h2("Worker.js Sprint 3 routes"),
  todo(
    "Crear routes/ dir + extraer 7 handlers",
    "handleOpggTierList, handleDpmTierList, handleRiotPatchNotes, handleUggProBuilds, handleOpggMatchups, handleOpggChampionAnalysis, handleGroqProxy. Worker.js -> <300 LOC fetch handler router.",
    "medio"
  ),

  h2("Performance"),
  todo(
    "Bundle analyzer Vite + code-split modals",
    "rollup-plugin-visualizer. Identifica top 5 chunks. Lazy load AiChat, Coach, Trends, History views.",
    "medio"
  ),
  todo(
    "Lighthouse CI sobre overlay window",
    "<2KB CSS budget. Workflow on PR.",
    "medio"
  ),
  todo(
    "Preload DDragon CDN connections",
    "<link rel='preconnect' href='https://ddragon.leagueoflegends.com'> en index.html. Saves first-paint.",
    "bajo"
  ),
  todo(
    "Defer Sentry init hasta primer render",
    "Mueve initSentry() de main.tsx a useEffect de App. Saves 50-150ms boot.",
    "medio"
  ),

  h2("SQLite"),
  todo(
    "Normalize matchups.notes JSON column",
    "Migration 007: matchup_tip_lines tabla normalizada. Query speed sobre tip search.",
    "medio"
  ),
  todo(
    "Index audit con EXPLAIN QUERY PLAN",
    "Top 10 queries hot path. Agregar índices faltantes.",
    "medio"
  ),
  todo(
    "Vacuum scheduled job weekly",
    "Reclama espacio + reorganiza pages. Background tarea Tauri.",
    "bajo"
  ),

  // ═══════════════════════════════════════════════════════
  // 5. SPRINT LARGO (alto risk)
  // ═══════════════════════════════════════════════════════
  h1("5. Sprint largo — alto risk, ~1 día cada uno"),

  h2("Refactors mayores"),
  todo(
    "lcu.rs split en sub-mods",
    "lcu/{api,runes,spells,item_sets,watcher,live_client}.rs. Necesita +10 tests sobre branches LCU primero. generate_handler! macro path qualification.",
    "alto"
  ),
  todo(
    "Worker.js E2E tests con wrangler dev",
    "Local server + Playwright API mode hitting endpoints. Pre-requisito real para Sprint 3 worker.",
    "alto"
  ),
  todo(
    "Mutation testing cargo-mutants sobre engine/",
    "coachEngine + suggestionEngine + draftWinrateEngine. Identifica branches sin asserts.",
    "alto"
  ),

  h2("Observability"),
  todo(
    "Sentry Performance traces rollout",
    "tracesSampleRate=0.05 prod. Identificar slow transactions: dbLoad, LCU connect, op.gg fetch.",
    "alto"
  ),
  todo(
    "Session Replay opt-in",
    "replaysOnErrorSampleRate=1.0 detrás de pref telemetry. GDPR compliance review primero.",
    "alto"
  ),
  todo(
    "OpenTelemetry exporter LCU latency",
    "Histograms percentiles req latency. Posiblemente overkill para app desktop.",
    "alto"
  ),

  // ═══════════════════════════════════════════════════════
  // 6. MEJORAS NICE-TO-HAVE
  // ═══════════════════════════════════════════════════════
  h1("6. Nice-to-have (sin orden)"),

  h2("UI / UX"),
  todo("Dark/light mode toggle", "Sistema OS + manual override en Preferences.", "medio"),
  todo("Animations FLIP en draft slot swaps", "Reordenar visualmente al swap pick.", "bajo"),
  todo("Drag-to-reorder en pickorder champ select sim", "Para draft mode practice.", "medio"),
  todo("Keyboard hint overlay (?)", "Press '?' -> floating shortcuts cheat sheet.", "bajo"),
  todo("Tier list filter chips (S+/S/A/B/C/D)", "Click chip -> filter visible rows.", "bajo"),

  h2("Coach AI"),
  todo("Multi-turn chat con memoria persistente", "ai_memory tabla ya existe. Usar context window per session.", "medio"),
  todo("Lesson plan auto-generate al completar 10 games", "Match repo trigger -> plan.", "medio"),
  todo("Voice input para AI Coach", "Web Speech Recognition API. Useful in-game.", "medio"),
  todo("Multi-provider tool calling (function calling)", "Cuando Groq/Gemini soporten, agregar tools.", "alto"),

  h2("Data / Meta"),
  todo("Pro play sync de LCK más frecuente", "Diario en lugar de weekly. Bump cron.", "bajo"),
  todo("Per-region tier list (KR vs EUW vs NA)", "Pref user region default. Already supported en dpm.", "bajo"),
  todo("Patch history viewer", "Compara 16.10 vs 16.11 champion tier diff.", "medio"),
  todo("Matchup notes user-created", "Tabla custom_matchup_notes. UI for jotting per-matchup tips.", "medio"),

  h2("Distribución"),
  todo("MSI installer (alternativa NSIS)", "Mejor para enterprise sysadmins.", "medio"),
  todo("macOS build + signing", "Tauri soporta. Necesita Apple Developer cert.", "alto"),
  todo("Linux .deb / .AppImage", "Tauri soporta. Tests Ubuntu 22.04.", "medio"),
  todo("Auto-rollback en update failure", "Tauri updater detecta crash post-update -> restore prev.", "alto"),

  // ═══════════════════════════════════════════════════════
  // 7. INFRAESTRUCTURA
  // ═══════════════════════════════════════════════════════
  h1("7. Infraestructura"),

  h2("CF Worker"),
  todo("Push GitLab submodule", "Local commits e4bd221 + 46c4479 sin push. Auth missing en sesión Claude. Tú haz: cd cloudflare-worker && git push origin main.", "bajo"),
  todo("KV namespace para cache compartida", "Reemplaza caches.default. Compartido entre regiones edge.", "alto"),
  todo("Wrangler tail logging en staging", "Logs en tiempo real para debug producción.", "bajo"),
  todo("Health endpoint /health con métricas", "Latencia avg último 5min, rate limit hits, error rate.", "medio"),

  h2("Cloudflare R2 storage"),
  todo("Mover Tauri update binaries de GitHub Releases a R2", "Más rápido global. ~$5/mes bandwidth.", "medio"),
  todo("Champion icon CDN propio en R2", "Backup si DDragon cae. Sync diario.", "alto"),

  h2("Release process"),
  todo("Conventional Commits enforced en hook", "commitlint + husky commit-msg.", "bajo"),
  todo("Changelog auto-generated", "release-please o standard-version.", "bajo"),
  todo("Semver tagging automático en CI", "Bump version on main merge según commit types.", "medio"),
  todo("Release notes draft auto-creado", "Saca de commits desde last tag.", "bajo"),

  // ═══════════════════════════════════════════════════════
  // 8. CALIDAD DE CÓDIGO
  // ═══════════════════════════════════════════════════════
  h1("8. Calidad de código"),

  h2("TypeScript strict"),
  todo("Enable strict: true full + noUncheckedIndexedAccess", "Identifica accesos array sin guard. Esperar a fix bug round.", "medio"),
  todo("eslint-plugin-react-hooks rule exhaustive-deps", "Catch missing deps en useEffect.", "bajo"),
  todo("eslint-plugin-jsx-a11y", "A11y warnings en JSX. Complementa axe tests.", "bajo"),
  todo("Type guards centralizados en utils/typeGuards.ts", "isChampion, isMatchData, etc. DRY.", "bajo"),

  h2("Rust clippy stricter"),
  todo("Enable clippy::pedantic + selective allow", "Más lints. Empezar con warnings, no deny.", "medio"),
  todo("cargo-deny config para vulns", "Bloquea crates con CVE conocidos.", "bajo"),
  todo("cargo-machete unused deps detection", "Identifica deps sin uso real.", "bajo"),

  // ═══════════════════════════════════════════════════════
  // 9. PRIORIZACIÓN RECOMENDADA
  // ═══════════════════════════════════════════════════════
  h1("9. Priorización recomendada"),
  p("Orden valor/risk para próximas waves:"),
  p(""),

  h2("Wave 1 (Sprint corto, 1 día)"),
  p("1. Push CF submodule GitLab (necesitas tú)"),
  p("2. Husky pre-commit + Dependabot (DX wins eternos)"),
  p("3. GitHub Actions matrix (CI gate)"),
  p("4. App.tsx 3 hooks finales (useDraftDerivations + useSuggestions + useDraftPrediction)"),
  p("5. Worker Sprint 3 helpers (DPM + opggMatchups + parseLane)"),

  h2("Wave 2 (Sprint medio, 2-3 días)"),
  p("1. Storybook + 10 stories"),
  p("2. Playwright 3 smoke tests"),
  p("3. Worker Sprint 3 routes (handlers -> routes/)"),
  p("4. Bundle analyzer + code-split"),
  p("5. Sentry PII snapshot tests"),

  h2("Wave 3 (Sprint largo, 1+ semana)"),
  p("1. lcu.rs split (alto risk pero alto valor mantenibilidad)"),
  p("2. Worker E2E con wrangler dev"),
  p("3. Sentry Performance rollout"),

  // ═══════════════════════════════════════════════════════
  // 10. NOTAS USO DOC
  // ═══════════════════════════════════════════════════════
  h1("10. Uso de este doc"),
  p("Workflow sugerido:"),
  p(""),
  p("• Marca ☐ → ✓ cuando completes en Word o impreso."),
  p("• Cuando tengas dudas o quieras priorizar diferente, mándame el item nombre."),
  p("• Al terminar wave, di 'regenera doc' y actualizo con estado nuevo."),
  p("• Color risk: verde = bajo, amarillo = medio, rojo = alto. Empieza por verdes."),
  p(""),
  p("Si descubres bug nuevo en producción durante uso, agrégalo a sección 2 (Bugs).", { italics: true }),
];

// ─────────────────────────────────────────────────────────
// Build doc
// ─────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Claude (Draftboard wave session)",
  title: "Draftboard TODO checklist",
  description: "Checklist accionable de debilidades pendientes — risk-colored, agrupado por sprint",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } }, // 11pt
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 400, after: 240 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "404040" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "Draftboard · TODO checklist",
                  size: 18,
                  color: "808080",
                  italics: true,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Página ", size: 18, color: "808080" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" }),
                new TextRun({ text: " / ", size: 18, color: "808080" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "808080" }),
              ],
            }),
          ],
        }),
      },
      children: sections,
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const outPath = path.join(__dirname, "draftboard-todo.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("DOCX written:", outPath);
  console.log("Size:", (buffer.length / 1024).toFixed(1), "KB");
});
