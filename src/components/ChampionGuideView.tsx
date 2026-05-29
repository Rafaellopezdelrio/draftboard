// Champion guide modal — abilities, info, builds, runes, power spikes, matchups.

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

const CHAMP_GUIDE_TITLE_ID = "champion-guide-title";
import type { ChampionDb } from "../types/champion";
import {
  fetchChampionDetail,
  type ChampionDetail,
} from "../services/dataDragon";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { displayPatch } from "../data/patchDisplay";
import { Tabs } from "./ui/Tabs";
import { Panel } from "./ui/Panel";
import { TierBadge } from "./ui/TierBadge";
import { PowerSpikesBars } from "./PowerSpikesBars";
import { BuildPanel } from "./BuildPanel";
import { getMatchupTips } from "../data/matchupTips";
import { generateChampionGuide, getCachedGuide } from "../services/aiChampionGuide";
import { usePrefsStore } from "../state/prefsStore";
import {
  Sparkles,
  Swords,
  ShieldCheck,
  Wand2,
  Mountain,
  Lightbulb,
  Info,
  Bot,
} from "lucide-react";
import type { Role } from "../types/champion";

interface Props {
  db: ChampionDb;
  championKey: string;
  onClose: () => void;
}

type Tab = "overview" | "abilities" | "build" | "tips" | "ai";

const ROLE_LIKE: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

export function ChampionGuideView({ db, championKey, onClose }: Props) {
  useEscape(onClose);
  const champ = db.champions[championKey];
  const [tab, setTab] = useState<Tab>("overview");
  const [detail, setDetail] = useState<ChampionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role>(
    (champ?.roles[0] as Role) ?? "MIDDLE"
  );

  useEffect(() => {
    if (!champ) return;
    setLoading(true);
    fetchChampionDetail(db.patch, champ.id)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [champ, db.patch]);

  // Hooks must run unconditionally (rules-of-hooks) — keep useRef +
  // useFocusTrap ABOVE the early return. The focus trap is a no-op while the
  // dialog isn't mounted (ref.current null), so calling it when champ is
  // null is harmless.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  if (!champ) return null;

  // Find meta tier entries for this champion
  const metaEntries = db.meta.filter((m) => m.championKey === championKey);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={CHAMP_GUIDE_TITLE_ID}
      className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[860px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero header with splash */}
        <div
          className="relative h-40 flex items-end p-5"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(7,9,15,0.4) 0%, rgba(7,9,15,0.85) 70%, rgba(17,21,31,1) 100%), url(${champ.splashUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center 25%",
          }}
        >
          <div className="flex items-end gap-4 w-full">
            <img
              src={champ.iconUrl}
              alt={champ.name}
              className="w-16 h-16 rounded-md ring-2 ring-accent shadow-2xl"
            />
            <div className="flex-1">
              <h2 id={CHAMP_GUIDE_TITLE_ID} className="text-3xl font-bold gold-text leading-none">
                {champ.name}
              </h2>
              <p className="text-sm text-white/70 italic mt-1">
                {champ.title}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              {metaEntries.slice(0, 3).map((m) => (
                <div
                  key={m.role}
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest"
                >
                  <span className="text-white/60">{m.role}</span>
                  <TierBadge tier={m.tier} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Role selector */}
        <div className="px-5 pt-3 pb-1 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">
              Rol
            </span>
            <div className="flex gap-1">
              {ROLE_LIKE.map((r) => {
                const isAvailable = champ.roles.includes(r);
                const isSelected = selectedRole === r;
                return (
                  <button
                    key={r}
                    onClick={() => isAvailable && setSelectedRole(r)}
                    disabled={!isAvailable}
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded transition ${
                      isSelected
                        ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                        : isAvailable
                          ? "text-white/55 hover:text-white/80"
                          : "text-white/15 cursor-not-allowed line-through"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
          <Tabs<Tab>
            tabs={[
              { value: "overview", label: "Resumen", icon: <Info className="w-3 h-3" /> },
              { value: "abilities", label: "Habilidades", icon: <Wand2 className="w-3 h-3" /> },
              { value: "build", label: "Build & runas", icon: <Mountain className="w-3 h-3" /> },
              { value: "tips", label: "Tips", icon: <Lightbulb className="w-3 h-3" /> },
              { value: "ai", label: "Guía AI", icon: <Bot className="w-3 h-3" /> },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-3 flex-1">
          {loading && (
            <p className="text-white/40 text-sm text-center py-8">Cargando guía...</p>
          )}

          {!loading && tab === "overview" && detail && (
            <OverviewTab champ={champ} detail={detail} />
          )}

          {!loading && tab === "abilities" && detail && (
            <AbilitiesTab detail={detail} patch={db.patch} />
          )}

          {!loading && tab === "build" && (
            <BuildPanel
              db={db}
              championKey={championKey}
              role={selectedRole}
              enemyKeys={[]}
            />
          )}

          {!loading && tab === "tips" && (
            <TipsTab db={db} championKey={championKey} championId={champ.id} />
          )}

          {!loading && tab === "ai" && (
            <AiGuideTab
              championId={Number(champ.key)}
              championName={champ.name}
              role={selectedRole}
              patch={db.patch}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  champ,
  detail,
}: {
  champ: ChampionDb["champions"][string];
  detail: ChampionDetail;
}) {
  const stats = [
    { label: "Ataque", value: detail.info.attack, color: "bg-bad" },
    { label: "Defensa", value: detail.info.defense, color: "bg-good" },
    { label: "Magia", value: detail.info.magic, color: "bg-purple-500" },
    { label: "Dificultad", value: detail.info.difficulty, color: "bg-meh" },
  ];

  return (
    <>
      <Panel padding="sm">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {champ.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-bg-card ring-1 ring-border-subtle text-white/65"
              >
                {t}
              </span>
            ))}
          </div>
          <PowerSpikesBars championId={champ.id} />
        </div>
      </Panel>

      <Panel padding="sm">
        <p className="text-[10px] uppercase tracking-widest text-white/45 font-semibold mb-2">
          Stats Riot
        </p>
        <div className="grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] uppercase text-white/55">
                  {s.label}
                </span>
                <span className="text-xs tabular-nums text-white/70">
                  {s.value}/10
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full ${s.color}`}
                  style={{ width: `${s.value * 10}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {detail.lore && (
        <Panel padding="sm">
          <p className="text-[10px] uppercase tracking-widest text-white/45 font-semibold mb-2">
            Lore
          </p>
          <p className="text-xs text-white/65 leading-relaxed line-clamp-6">
            {detail.lore}
          </p>
        </Panel>
      )}
    </>
  );
}

function AbilitiesTab({ detail, patch }: { detail: ChampionDetail; patch: string }) {
  const passive = detail.passive;
  const abilities = [
    { key: "P", spell: { ...passive, cooldown: [], cost: [], range: [] } },
    ...detail.spells.map((s, i) => ({ key: ["Q", "W", "E", "R"][i], spell: s })),
  ];
  return (
    <div className="space-y-2">
      {abilities.map(({ key, spell }) => (
        <Panel key={key} padding="sm">
          <div className="flex gap-3">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <img
                src={
                  key === "P"
                    ? `https://ddragon.leagueoflegends.com/cdn/${patch}/img/passive/${(spell as { image?: { full?: string } }).image?.full ?? ""}`
                    : `https://ddragon.leagueoflegends.com/cdn/${patch}/img/spell/${(spell as { image?: { full?: string } }).image?.full ?? ""}`
                }
                alt={spell.name}
                className="w-12 h-12 rounded ring-1 ring-border-strong"
                onError={(e) =>
                  ((e.target as HTMLImageElement).style.opacity = "0.3")
                }
              />
              <span className="text-[10px] font-bold gold-text tracking-widest">
                {key}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{spell.name}</p>
              <p
                className="text-[11px] text-white/65 leading-relaxed mt-1"
                dangerouslySetInnerHTML={{
                  __html: stripHtml(spell.description),
                }}
              />
              {spell.cooldown && spell.cooldown.length > 0 && (
                <div className="flex gap-3 mt-2 text-[10px] text-white/50">
                  <span>
                    CD:{" "}
                    <span className="text-white/80 tabular-nums">
                      {spell.cooldown.join("/")}s
                    </span>
                  </span>
                  {spell.cost && spell.cost.some((c) => c > 0) && (
                    <span>
                      Cost:{" "}
                      <span className="text-white/80 tabular-nums">
                        {spell.cost.join("/")}
                      </span>
                    </span>
                  )}
                  {spell.range && spell.range.some((r) => r > 0) && (
                    <span>
                      Range:{" "}
                      <span className="text-white/80 tabular-nums">
                        {spell.range[0]}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

// UI strings for TipsTab. Kept inline because they're tiny and only used
// here — promoting them to a full i18n system would be over-engineering
// until we have more bilingual surfaces.
const TIPS_I18N = {
  es: {
    tipsHeader: "Tips para jugarlo bien",
    tipLearn: "Aprende sus combos básicos en práctica antes de SoloQ",
    tipSpike: "Identifica el power spike (revisa tab Resumen)",
    tipBuild: "Mira las builds por rol en tab Build & runas",
    whenFacing: "Cuando lo enfrentas",
  },
  en: {
    tipsHeader: "Tips to play it well",
    tipLearn: "Learn the basic combos in practice tool before SoloQ",
    tipSpike: "Identify the power spikes (check the Summary tab)",
    tipBuild: "See builds per role in the Build & runes tab",
    whenFacing: "When you face them",
  },
};

function TipsTab({
  db,
  championKey,
  championId,
}: {
  db: ChampionDb;
  championKey: string;
  championId: string;
}) {
  void championKey;
  const lang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const t = lang === "en" ? TIPS_I18N.en : TIPS_I18N.es;
  // Use matchup tips as inverse — what enemies say about playing vs me
  const idToName = new Map<string, string>();
  for (const c of Object.values(db.champions)) idToName.set(c.key, c.id);
  // tips that other champions have vs OUR champion
  const ourEntry = Object.entries(db.champions).find(
    ([, c]) => c.id === championId
  );
  const ourName = ourEntry?.[1].name ?? "";

  // Show tips ABOUT this champion when you face them. Same lang used as
  // the UI strings — the curated DB has parallel arrays for es/en.
  const tipsForThisChamp = getMatchupTips(undefined, [championKey], idToName, lang);
  const tipsAboutEnemies = tipsForThisChamp.filter((tip) => tip.versus === ourName);

  return (
    <div className="space-y-2">
      <Panel padding="sm">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
            {t.tipsHeader}
          </p>
        </div>
        <ul className="space-y-1.5 text-xs text-white/75">
          <li className="flex gap-2">
            <Swords className="w-3 h-3 text-bad shrink-0 mt-0.5" />
            <span>{t.tipLearn}</span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="w-3 h-3 text-good shrink-0 mt-0.5" />
            <span>{t.tipSpike}</span>
          </li>
          <li className="flex gap-2">
            <Mountain className="w-3 h-3 text-accent shrink-0 mt-0.5" />
            <span>{t.tipBuild}</span>
          </li>
        </ul>
      </Panel>

      {tipsAboutEnemies.length > 0 && (
        <Panel padding="sm">
          <p className="text-[10px] uppercase tracking-widest text-white/45 font-semibold mb-2">
            {t.whenFacing}
          </p>
          <div className="space-y-1.5">
            {tipsAboutEnemies.map((t, i) => (
              <p key={i} className="text-xs text-white/75 leading-relaxed">
                • {t.tip}
              </p>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function AiGuideTab({
  championId,
  championName,
  role,
  patch,
}: {
  championId: number;
  championName: string;
  role: Role;
  patch: string;
}) {
  const provider = usePrefsStore((s) => s.prefs.aiProvider);
  const apiKey = usePrefsStore((s) =>
    s.prefs.aiProvider === "groq"
      ? s.prefs.groqApiKey
      : s.prefs.aiProvider === "gemini"
        ? s.prefs.geminiApiKey
        : s.prefs.anthropicApiKey
  );
  const lang = usePrefsStore((s) => s.prefs.aiCoachLanguage);

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    setText("");
    setErr(null);
    setCached(false);
    getCachedGuide(championId, patch).then((g) => {
      if (g) {
        setText(g.guideText);
        setCached(true);
      }
    });
  }, [championId, patch]);

  async function generate(force = false) {
    if (!apiKey) {
      setErr(`Configura API key (${provider}) en Prefs`);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const t = await generateChampionGuide({
        provider,
        apiKey,
        championId,
        championName,
        role,
        patch,
        language: lang,
        force,
      });
      setText(t);
      setCached(true);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel padding="sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-accent" />
          <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
            Guía AI · {role} · {displayPatch(patch)}
          </p>
        </div>
        {cached && (
          <span className="text-[9px] uppercase tracking-widest text-good">
            cacheado
          </span>
        )}
      </div>

      {!text && !loading && (
        <>
          <p className="text-xs text-white/65 mb-2">
            Genera una guía AI para {championName} en {role} adaptada al parche actual.
            Se cachea: la próxima vez será instantánea.
          </p>
          <button
            onClick={() => generate(false)}
            disabled={!apiKey}
            className="px-3 py-1.5 bg-accent text-black font-medium rounded-md text-xs disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3" />
            Generar guía AI
          </button>
          {!apiKey && (
            <p className="text-[10px] text-meh mt-2">
              Necesitas API key ({provider}) en Prefs. Groq es gratis.
            </p>
          )}
        </>
      )}

      {loading && (
        <p className="text-white/50 text-xs text-center py-6">
          Generando guía profesional...
        </p>
      )}

      {err && <p className="text-xs text-bad">{err}</p>}

      {text && (
        <>
          <div className="text-xs text-white/85 leading-relaxed space-y-1.5">
            <Markdown source={text} />
          </div>
          <button
            onClick={() => generate(true)}
            disabled={loading || !apiKey}
            className="mt-3 text-[10px] text-white/45 hover:text-accent uppercase tracking-widest"
          >
            regenerar
          </button>
        </>
      )}
    </Panel>
  );
}

/**
 * Strict HTML sanitizer for Data Dragon ability descriptions.
 *
 * Data Dragon is a trusted Riot CDN, but defense-in-depth: if Riot's CDN
 * ever serves malicious content (compromise, MITM, dev mistake), we don't
 * want it to run scripts in our Tauri webview.
 *
 * Allowlist approach: drop EVERYTHING that isn't a known-safe formatting tag.
 */
function stripHtml(html: string): string {
  // 1. Remove entire dangerous blocks (scripts, styles, iframes, etc.)
  let out = html.replace(
    /<(script|style|iframe|object|embed|link|meta|form|input|button|svg)[^>]*>.*?<\/\1>/gis,
    ""
  );
  // 2. Remove self-closing dangerous tags
  out = out.replace(
    /<(script|iframe|object|embed|link|meta|input|img)\b[^>]*\/?>/gi,
    ""
  );
  // 3. Strip ALL event handlers (onclick, onerror, onmouseover, etc.)
  out = out.replace(/\son\w+\s*=\s*(["'])[^"']*\1/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  // 4. Strip javascript:/data: URLs in attributes
  out = out.replace(/\s(href|src|action)\s*=\s*(["'])\s*(javascript|data|vbscript)\s*:[^"']*\2/gi, "");
  // 5. Whitelist: keep only specific tags, strip everything else but keep text
  const ALLOWED = /^(br|b|strong|i|em|span|font|color|small|p|ul|li)$/i;
  out = out.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
    return ALLOWED.test(tag) ? match : "";
  });
  return out;
}

// Exported so unit tests can import it
export const __testOnly_stripHtml = stripHtml;

/**
 * Tiny markdown renderer for LLM output. Supports:
 *   - `## heading` and `# heading`
 *   - `**bold**`
 *   - `_italic_` and `*italic*` (whole-word boundaries — won't eat
 *     `snake_case_words`)
 *   - bullet lists starting with `- ` or `* `
 *   - paragraphs separated by blank lines
 *
 * Why not pull in react-markdown: it's ~50kB gzipped for what we use here.
 * We control the LLM output prompt so we know the surface area is small.
 */
function Markdown({ source }: { source: string }) {
  const blocks: ReactElement[] = [];
  const lines = source.split(/\r?\n/);
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];
  let idx = 0;

  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    const text = paraBuffer.join(" ");
    blocks.push(
      <p key={`p-${idx++}`} className="leading-relaxed">
        {renderInline(text)}
      </p>
    );
    paraBuffer = [];
  };
  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${idx++}`} className="list-disc list-inside space-y-0.5 pl-1">
        {listBuffer.map((it, i) => (
          <li key={i}>{renderInline(it)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    // Headers
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length;
      const cls =
        level <= 2
          ? "text-[11px] uppercase tracking-widest text-accent font-semibold mt-2"
          : "text-[10px] uppercase tracking-wide text-white/70 font-semibold mt-1";
      blocks.push(
        <p key={`h-${idx++}`} className={cls}>
          {renderInline(h[2])}
        </p>
      );
      continue;
    }
    // Bullet
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushPara();
      listBuffer.push(bullet[1]);
      continue;
    }
    // Numbered list — treat as paragraph with the number kept
    paraBuffer.push(line);
  }
  flushPara();
  flushList();
  return <>{blocks}</>;
}

/**
 * Inline markdown: **bold**, _italic_, *italic*. Splits the string into
 * a list of strings and React nodes. Order matters: bold first (longer
 * delimiter) so it doesn't get eaten by the italic pass.
 */
function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*)|(\b_[^_\n]+_\b)|(\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={`b-${i++}`} className="text-white font-semibold">
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      // italic from _x_ or *x*
      parts.push(
        <em key={`i-${i++}`} className="text-accent/90 not-italic font-medium">
          {tok.slice(1, -1)}
        </em>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
