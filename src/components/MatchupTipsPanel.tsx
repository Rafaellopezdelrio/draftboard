import { useEffect, useMemo, useState } from "react";
import type { ChampionDb, Role } from "../types/champion";
import { getMatchupTips } from "../data/matchupTips";
import { usePrefsStore } from "../state/prefsStore";
import { Panel, PanelHeader } from "./ui/Panel";
import { Lightbulb, Bot, Sparkles } from "lucide-react";
import {
  generateMatchupTips,
  getCachedMatchupTips,
} from "../services/aiMatchupTips";

interface Props {
  db: ChampionDb;
  enemyKeys: string[];
  myChampionKey?: string | null;
  myRole?: Role | null;
}

export function MatchupTipsPanel({
  db,
  enemyKeys,
  myChampionKey,
  myRole,
}: Props) {
  const beginner = usePrefsStore((s) => s.prefs.beginnerMode);
  const panelLang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const idToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of Object.values(db.champions)) m.set(c.key, c.id);
    return m;
  }, [db]);
  const tips = getMatchupTips(undefined, enemyKeys, idToName, panelLang);

  const enemyWithTip = new Set(
    tips.map((t) => {
      const found = Object.values(db.champions).find((c) => c.name === t.versus);
      return found?.key ?? "";
    })
  );
  const enemiesWithoutTip = enemyKeys.filter((k) => !enemyWithTip.has(k));

  const visible = beginner ? tips : tips.slice(0, 3);

  if (tips.length === 0 && enemiesWithoutTip.length === 0) return null;

  return (
    <Panel padding="sm">
      <PanelHeader
        icon={<Lightbulb className="w-3 h-3" />}
        title={panelLang === "en" ? "Matchup tips" : "Tips de matchup"}
      />
      <div className="space-y-1.5">
        {visible.map((t, i) => (
          <div
            key={i}
            className="p-2 rounded ring-1 ring-border-subtle bg-bg-card/60"
          >
            <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
              vs {t.versus}
            </p>
            <p className="text-xs text-white/85 mt-0.5 leading-relaxed">
              {t.tip}
            </p>
          </div>
        ))}
        {myChampionKey && myRole &&
          enemiesWithoutTip.map((enemyKey) => (
            <AiMatchupRow
              key={`ai-${enemyKey}`}
              db={db}
              myChampionKey={myChampionKey}
              enemyKey={enemyKey}
              role={myRole}
            />
          ))}
      </div>
    </Panel>
  );
}

function AiMatchupRow({
  db,
  myChampionKey,
  enemyKey,
  role,
}: {
  db: ChampionDb;
  myChampionKey: string;
  enemyKey: string;
  role: Role;
}) {
  const me = db.champions[myChampionKey];
  const en = db.champions[enemyKey];
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

  useEffect(() => {
    if (!me || !en) return;
    getCachedMatchupTips(
      Number(me.key),
      Number(en.key),
      role,
      db.patch
    ).then((c) => {
      if (c) setText(c.tipsText);
    });
  }, [myChampionKey, enemyKey, role, db.patch, me, en]);

  if (!me || !en) return null;

  async function generate() {
    if (!apiKey) {
      setErr(`Configura API key (${provider})`);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const t = await generateMatchupTips({
        provider,
        apiKey,
        championA: Number(me.key),
        championAName: me.name,
        championB: Number(en.key),
        championBName: en.name,
        position: role,
        patch: db.patch,
        language: lang,
      });
      setText(t);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-2 rounded ring-1 ring-purple-400/20 bg-purple-400/5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-widest text-purple-300 font-semibold inline-flex items-center gap-1">
          <Bot className="w-3 h-3" /> vs {en.name}
        </p>
        {!text && (
          <button
            onClick={generate}
            disabled={loading || !apiKey}
            className="text-[10px] text-accent hover:underline disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Sparkles className="w-2.5 h-2.5" />
            {loading ? "..." : "AI tips"}
          </button>
        )}
      </div>
      {text && (
        <p className="text-xs text-white/85 leading-relaxed whitespace-pre-wrap">
          {text}
        </p>
      )}
      {err && <p className="text-[10px] text-bad mt-1">{err}</p>}
    </div>
  );
}
