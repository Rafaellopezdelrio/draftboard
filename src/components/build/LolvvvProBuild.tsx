// Pro build from lolvvv.com — pro accounts' soloQ + esports games over the
// last ~5 patches: starter → first three items → boots, spells, skill order
// and a full rune page the user can push to the client in one click.
//
// lolvvv only has the champion's primary role; on an off-role pick the
// section renders nothing rather than showing another role's build.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Role } from "../../types/champion";
import { fetchLolvvvBuild, type LolvvvBuild } from "../../services/lolvvvBuilds";
import { SUMMONER_SPELL_META } from "../../services/opggBuilds";
import { applyRunes } from "../../services/lcuService";
import { usePrefsStore } from "../../state/prefsStore";
import { useToast } from "../ui/ToastContainer";
import { Panel } from "../ui/Panel";
import { ItemIcon, SpellIcon } from "./icons";
import { RuneIcon } from "./RuneIcon";
import { SkillOrderSection } from "./SkillOrderSection";

interface Props {
  /** DDragon champion id ("MonkeyKing"). */
  championId: string;
  championName: string;
  role: Role;
  patch: string;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function LolvvvProBuild({ championId, championName, role, patch }: Props) {
  const { t } = useTranslation();
  const { push: pushToast } = useToast();
  const showRuneButton = usePrefsStore((s) => s.prefs.showRuneImportButton);
  const [data, setData] = useState<LolvvvBuild | null>(null);
  const [applyStatus, setApplyStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setApplyStatus("");
    fetchLolvvvBuild(championId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [championId]);

  if (!data || data.role !== role) return null;

  // "EUW1" → "EUW"; ESPORT stays as-is.
  const regions = data.regions
    .filter((r) => r.games > 0)
    .map((r) => r.id.replace(/\d+$/, ""))
    .join(" / ");
  const page = data.runePage;

  const applyPage = async () => {
    if (!page) return;
    setApplyStatus(t("build.applying"));
    const ok = await applyRunes({
      name: `${championName} · Pros`,
      primaryStyleId: page.primaryStyleId,
      subStyleId: page.subStyleId,
      selectedPerkIds: page.selectedPerkIds,
    });
    setApplyStatus(ok ? t("build.applied") : t("build.applyError"));
    pushToast({
      type: ok ? "success" : "error",
      title: ok ? t("build.toastAppliedTitle") : t("build.toastApplyErrorTitle"),
      detail: ok ? t("build.toastAppliedDetail") : t("build.toastApplyErrorDetail"),
      durationMs: 3000,
    });
  };

  return (
    <Panel
      padding="sm"
      collapsible
      defaultOpen
      storageKey="lolvvvPros"
      icon={<span className="text-accent">🎯</span>}
      title={t("build.lolvvv.title")}
      summary={t("build.lolvvv.summary", { count: data.games, regions })}
    >
      <div className="space-y-2.5">
        {/* Starter → 1st / 2nd / 3rd item + boots. */}
        <div>
          <p className="text-[9px] uppercase tracking-widest text-white/40 mb-1">
            {t("build.lolvvv.items")}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {data.starter?.ids.map((id, i) => (
              <ItemIcon key={`s${i}`} patch={patch} id={id} />
            ))}
            {data.starter && data.items.length > 0 && (
              <span className="text-white/30 text-xs">→</span>
            )}
            {data.items.map((it, i) => (
              <span key={i} className="flex flex-col items-center gap-0.5">
                <ItemIcon patch={patch} id={it.id} />
                <span className="text-[9px] tabular-nums text-white/45">{pct(it.pickRate)}</span>
              </span>
            ))}
            {data.boots && (
              <>
                <span className="text-white/30 text-xs">+</span>
                <ItemIcon patch={patch} id={data.boots.id} />
              </>
            )}
            {data.spells && (
              <span className="ml-auto flex items-center gap-1">
                {data.spells.ids.map((id) => (
                  <SpellIcon key={id} id={id} meta={SUMMONER_SPELL_META[id]} patch={patch} />
                ))}
              </span>
            )}
          </div>
        </div>

        {data.skillOrder && (
          <SkillOrderSection order={data.skillOrder} championId={championId} patch={patch} />
        )}

        {page && (
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-[9px] uppercase tracking-widest text-white/40">
                {t("build.lolvvv.runes", { pct: pct(page.pickRate) })}
              </p>
              {showRuneButton && (
                <button
                  className="text-xs font-medium px-2 py-0.5 bg-accent text-black rounded hover:bg-accent-deep transition"
                  onClick={applyPage}
                >
                  {applyStatus || t("build.apply")}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {page.selectedPerkIds.slice(0, 4).map((id, i) => (
                <RuneIcon key={`p${i}`} name={String(id)} keystone={i === 0} />
              ))}
              <span className="w-2" />
              {page.selectedPerkIds.slice(4, 6).map((id, i) => (
                <RuneIcon key={`s${i}`} name={String(id)} small />
              ))}
              <span className="w-2" />
              {page.selectedPerkIds.slice(6).map((id, i) => (
                <RuneIcon key={`f${i}`} name={String(id)} small />
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
