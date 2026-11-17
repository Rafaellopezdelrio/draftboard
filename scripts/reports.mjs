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
if (count.size) {
  console.log("Pantallas más usadas (7 días):");
  for (const [name, n] of [...count].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${name}: ${n}`);
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
