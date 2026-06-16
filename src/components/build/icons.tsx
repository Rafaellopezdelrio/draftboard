// Shared icon primitives for the build panel — item, perk, summoner spell.
//
// Extracted from BuildPanel.tsx so child sub-components (BuildRow,
// ProBuildsSection, MatchupGrid, etc) can import them without pulling
// the whole BuildPanel module + its 1k LOC of unrelated logic.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getItemMeta, subscribeToItemMeta } from "../../services/itemMeta";

/**
 * DDragon item icon by ID. Returns null for invalid IDs (0, undefined,
 * consumable placeholders) so caller doesn't have to guard. Rich
 * tooltip shows name + plaintext + gold cost once items.json loads.
 */
export function ItemIcon({ patch, id }: { patch: string; id: number }) {
  const { t } = useTranslation();
  // Re-render hook: title flips from "Item {id}" to real name once
  // items.json finishes loading via subscribeToItemMeta.
  const [, force] = useState(0);
  useEffect(() => {
    return subscribeToItemMeta(() => force((n) => n + 1));
  }, []);
  if (!id || id <= 0) return null;
  const meta = getItemMeta(patch, id);
  const titleParts: string[] = [];
  if (meta?.name) titleParts.push(meta.name);
  if (meta?.plaintext) titleParts.push(meta.plaintext);
  if (meta?.goldTotal && meta.goldTotal > 0) titleParts.push(`${meta.goldTotal}g`);
  const title = titleParts.length > 0 ? titleParts.join(" · ") : t("build.itemFallback", { id });
  return (
    <img
      src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`}
      alt={meta?.name ?? ""}
      className="w-8 h-8 rounded border border-border-subtle"
      title={title}
      onError={(e) => {
        // DDragon returned 404 — hide instead of showing alt text.
        const img = e.currentTarget;
        img.style.display = "none";
      }}
    />
  );
}

/**
 * CommunityDragon perk icon by raw perk id. Used for runes in the
 * legacy aggregator path (not the new RuneIcon which uses the perks
 * manifest). Kept thin — fall through to default opacity dim on 404.
 */
export function PerkIcon({ id, small = false }: { id: number; small?: boolean }) {
  const { t } = useTranslation();
  const size = small ? "w-5 h-5" : "w-8 h-8";
  const fallback = t("build.perkFallback", { id });
  return (
    <img
      src={`https://raw.communitydragon.org/latest/game/assets/perks/${id}.png`}
      alt={fallback}
      className={`${size} rounded`}
      onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")}
      title={fallback}
    />
  );
}

/**
 * Summoner spell icon. DDragon serves them by filename (SummonerFlash.png);
 * we fall back to a generic flash icon when the meta map doesn't have
 * the spell (covers ARAM Mark/Snowball + future additions).
 */
export function SpellIcon({
  id,
  meta,
  patch,
}: {
  id: number;
  meta?: { name: string; icon: string };
  patch: string;
}) {
  const { t } = useTranslation();
  const src = meta
    ? `https://ddragon.leagueoflegends.com/cdn/${patch}/img/spell/${meta.icon}`
    : `https://raw.communitydragon.org/latest/game/data/spells/icons2d/summoner_flash.png`;
  const fallback = meta?.name ?? t("build.spellFallback", { id });
  return (
    <img
      src={src}
      alt={fallback}
      className="w-8 h-8 rounded border border-border-subtle"
      title={fallback}
      onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")}
    />
  );
}
