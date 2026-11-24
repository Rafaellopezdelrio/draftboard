// Summary of what testers send (suggestions, bugs, errors, daily usage).
// Run from the repo root:  npm run reports
// Reads our D1 database through wrangler with your Cloudflare login.
// Read-only; see docs/REPORTS.md.
import { execSync } from "node:child_process";

const DB = "draftboard-reports";

function query(sql) {
  // npx is a .cmd on Windows, so this goes through the shell; the queries
  // below are fixed text that only uses single quotes inside.
  const out = execSync(`npx wrangler d1 execute ${DB} --remote --json --command "${sql}"`, {
    cwd: "cloudflare-worker",
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out)[0].results;
}

const when = (ms) => new Date(ms).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
const KIND = { suggestion: "Sugerencia", bug: "Error (usuario)", error: "Error automático" };

console.log("\n== Instalaciones nuevas (las actualizaciones no cuentan) ==");
const installs = query("SELECT day, SUM(count) AS n FROM installs GROUP BY day ORDER BY day DESC LIMIT 14");
const totalInstalls = query("SELECT COALESCE(SUM(count), 0) AS n FROM installs")[0].n;
console.log(`Total: ${totalInstalls}`);
for (const r of installs) console.log(`  ${r.day}: ${r.n}`);

console.log("\n== Uso (solo quien dio permiso) ==");
const week = query(
  "SELECT id, COUNT(*) AS dias FROM usage WHERE day >= date('now','-6 days') GROUP BY id"
);
const regulars = week.filter((r) => r.dias >= 3).length;
console.log(`Últimos 7 días: ${week.length} personas; ${regulars} la abrieron 3 días o más.`);
for (const r of query("SELECT day, COUNT(*) AS personas FROM usage GROUP BY day ORDER BY day DESC LIMIT 14")) {
  console.log(`  ${r.day}: ${r.personas}`);
}
const views = query("SELECT views FROM usage WHERE day >= date('now','-6 days')");
const count = new Map();
for (const { views: v } of views) for (const name of v.split(",").filter(Boolean)) count.set(name, (count.get(name) ?? 0) + 1);
const sorted = [...count].sort((a, b) => b[1] - a[1]);
const screens = sorted.filter(([name]) => !name.startsWith("f-"));
if (screens.length) {
  console.log("Pantallas más usadas (7 días, días-persona):");
  for (const [name, n] of screens.slice(0, 10)) console.log(`  ${name}: ${n}`);
}

// Features ("f-" names, see trackFeature in src/services/reports.ts).
// Counted once per person per day; the number is "days-person it happened".
const FEATURE = {
  "champ-select": "Selección de campeones con la app abierta",
  "in-game": "Partida con la app abierta",
  "postgame-coach": "Coach de después de la partida",
  "team-mode": "Modo equipo (5 en la sala)",
  "team-style": "Eligió un estilo de equipo",
  "voice-natural": "Voz natural habló",
  "voice-pc": "Voz del PC habló (eligió voz de Windows)",
  "voice-pc-while-loading": "Voz del PC mientras cargaba la natural",
  "voice-natural-failed": "FALLO: la voz natural no cargó",
  "sync-lcu": "Partidas leídas del cliente de LoL",
  "sync-riot": "Partidas bajadas de Riot",
  "sync-none": "FALLO: no se pudo leer ninguna partida",
  "sync-riot-failed": "FALLO: Riot no respondió (se usó el cliente)",
  "prosync-ok": "Datos de pros actualizados",
  "prosync-empty": "FALLO: datos de pros vacíos",
  "prosync-fail": "FALLO: datos de pros no se pudieron bajar",
};
const featureLabel = (name) => {
  if (FEATURE[name]) return FEATURE[name];
  let m;
  if ((m = /^meta-(.+)$/.exec(name)))
    return m[1] === "static" ? "FALLO: tier list sin fuentes (datos básicos)" : `Tier list desde ${m[1]}`;
  if ((m = /^ai-(\w+)-(ok|fail)$/.exec(name)))
    return m[2] === "ok" ? `IA respondió (${m[1]})` : `FALLO: la IA no respondió (${m[1]})`;
  if ((m = /^said-(.+)$/.exec(name))) return `Aviso por voz en partida: ${m[1]}`;
  return name;
};
const features = sorted.filter(([name]) => name.startsWith("f-"));
if (features.length) {
  console.log("Funciones (7 días, días-persona; los FALLO primero):");
  const rows = features.map(([name, n]) => [featureLabel(name.slice(2)), n]);
  rows.sort((a, b) => Number(b[0].startsWith("FALLO")) - Number(a[0].startsWith("FALLO")) || b[1] - a[1]);
  for (const [label, n] of rows) console.log(`  ${label}: ${n}`);
}

const versions = query(
  "SELECT version, COUNT(DISTINCT id) AS personas FROM usage WHERE day >= date('now','-6 days') GROUP BY version ORDER BY personas DESC"
);
if (versions.length) {
  console.log("Versión que usan (7 días):");
  for (const r of versions) console.log(`  v${r.version}: ${r.personas}`);
}

console.log("\n== Avisos (últimos 30) ==");
const reports = query("SELECT id, ts, kind, version, message FROM reports ORDER BY ts DESC LIMIT 30");
if (!reports.length) console.log("Ninguno todavía.");
for (const r of reports) {
  console.log(`#${r.id} ${when(r.ts)} · ${KIND[r.kind] ?? r.kind} · v${r.version}`);
  console.log(`   ${r.message.replace(/\s+/g, " ").slice(0, 200)}`);
}
console.log("\nDetalle de uno:  npm run reports -- <número>");

const id = Number(process.argv[2]);
if (Number.isInteger(id) && id > 0) {
  const [r] = query(`SELECT * FROM reports WHERE id = ${id}`);
  console.log(r ? `\n== #${id} ==\n${r.message}\n\n${r.details ?? "(sin detalles)"}` : `\nNo existe el #${id}.`);
}
