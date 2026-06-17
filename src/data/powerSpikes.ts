// Champion power spike profiles. Tells the user when a champion is strong/weak.

export interface PowerSpikeProfile {
  // 0-10 strength rating per timing window
  level1to3: number;
  level4to6: number;
  firstItem: number;
  twoItems: number;
  fullBuild: number;
  // i18n key (powerSpikes.summary.<championId>) for the one-line UI summary,
  // resolved at the render site / via i18n.t in the engine.
  summaryKey: string;
}

const PROFILES: Record<string, PowerSpikeProfile> = {
  Yasuo: { level1to3: 5, level4to6: 6, firstItem: 8, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Yasuo" },
  Yone: { level1to3: 4, level4to6: 6, firstItem: 7, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Yone" },
  Zed: { level1to3: 5, level4to6: 9, firstItem: 8, twoItems: 9, fullBuild: 7, summaryKey: "powerSpikes.summary.Zed" },
  Ahri: { level1to3: 5, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Ahri" },
  Akali: { level1to3: 4, level4to6: 6, firstItem: 8, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Akali" },
  Katarina: { level1to3: 5, level4to6: 7, firstItem: 9, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Katarina" },
  Veigar: { level1to3: 3, level4to6: 5, firstItem: 6, twoItems: 8, fullBuild: 10, summaryKey: "powerSpikes.summary.Veigar" },
  Darius: { level1to3: 7, level4to6: 9, firstItem: 8, twoItems: 7, fullBuild: 6, summaryKey: "powerSpikes.summary.Darius" },
  Garen: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.Garen" },
  Nasus: { level1to3: 2, level4to6: 4, firstItem: 6, twoItems: 8, fullBuild: 10, summaryKey: "powerSpikes.summary.Nasus" },
  Vayne: { level1to3: 3, level4to6: 5, firstItem: 6, twoItems: 8, fullBuild: 10, summaryKey: "powerSpikes.summary.Vayne" },
  Tryndamere: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 9, summaryKey: "powerSpikes.summary.Tryndamere" },
  MasterYi: { level1to3: 4, level4to6: 6, firstItem: 8, twoItems: 10, fullBuild: 10, summaryKey: "powerSpikes.summary.MasterYi" },
  Caitlyn: { level1to3: 7, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.Caitlyn" },
  Jinx: { level1to3: 4, level4to6: 5, firstItem: 7, twoItems: 9, fullBuild: 10, summaryKey: "powerSpikes.summary.Jinx" },
  Kaisa: { level1to3: 4, level4to6: 6, firstItem: 8, twoItems: 9, fullBuild: 9, summaryKey: "powerSpikes.summary.Kaisa" },
  MissFortune: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.MissFortune" },
  Ezreal: { level1to3: 5, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summaryKey: "powerSpikes.summary.Ezreal" },
  Ashe: { level1to3: 5, level4to6: 7, firstItem: 7, twoItems: 8, fullBuild: 8, summaryKey: "powerSpikes.summary.Ashe" },
  Lulu: { level1to3: 6, level4to6: 7, firstItem: 7, twoItems: 7, fullBuild: 8, summaryKey: "powerSpikes.summary.Lulu" },
  Thresh: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 8, fullBuild: 8, summaryKey: "powerSpikes.summary.Thresh" },
  Leona: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 7, fullBuild: 6, summaryKey: "powerSpikes.summary.Leona" },
  Nautilus: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.Nautilus" },
  Senna: { level1to3: 6, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 10, summaryKey: "powerSpikes.summary.Senna" },
  Soraka: { level1to3: 5, level4to6: 7, firstItem: 7, twoItems: 8, fullBuild: 9, summaryKey: "powerSpikes.summary.Soraka" },
  Pyke: { level1to3: 6, level4to6: 8, firstItem: 8, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.Pyke" },
  Janna: { level1to3: 6, level4to6: 6, firstItem: 7, twoItems: 7, fullBuild: 8, summaryKey: "powerSpikes.summary.Janna" },
  Morgana: { level1to3: 5, level4to6: 7, firstItem: 7, twoItems: 8, fullBuild: 8, summaryKey: "powerSpikes.summary.Morgana" },
  Blitzcrank: { level1to3: 7, level4to6: 7, firstItem: 7, twoItems: 7, fullBuild: 6, summaryKey: "powerSpikes.summary.Blitzcrank" },
  Briar: { level1to3: 6, level4to6: 8, firstItem: 9, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Briar" },
  Warwick: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 7, fullBuild: 6, summaryKey: "powerSpikes.summary.Warwick" },
  Diana: { level1to3: 5, level4to6: 8, firstItem: 9, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Diana" },
  Hecarim: { level1to3: 4, level4to6: 6, firstItem: 7, twoItems: 9, fullBuild: 9, summaryKey: "powerSpikes.summary.Hecarim" },
  XinZhao: { level1to3: 6, level4to6: 8, firstItem: 8, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.XinZhao" },
  Graves: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Graves" },
  LeeSin: { level1to3: 7, level4to6: 8, firstItem: 7, twoItems: 6, fullBuild: 5, summaryKey: "powerSpikes.summary.LeeSin" },
  Kayn: { level1to3: 5, level4to6: 6, firstItem: 9, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Kayn" },
  Lillia: { level1to3: 5, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summaryKey: "powerSpikes.summary.Lillia" },
  Nocturne: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.Nocturne" },
  Sett: { level1to3: 7, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.Sett" },
  Mordekaiser: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 8, summaryKey: "powerSpikes.summary.Mordekaiser" },
  Camille: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Camille" },
  Fiora: { level1to3: 5, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 8, summaryKey: "powerSpikes.summary.Fiora" },
  Jax: { level1to3: 4, level4to6: 6, firstItem: 7, twoItems: 9, fullBuild: 9, summaryKey: "powerSpikes.summary.Jax" },
  Renekton: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 7, fullBuild: 6, summaryKey: "powerSpikes.summary.Renekton" },
  Gwen: { level1to3: 4, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summaryKey: "powerSpikes.summary.Gwen" },
  Yorick: { level1to3: 5, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summaryKey: "powerSpikes.summary.Yorick" },
  Lux: { level1to3: 6, level4to6: 7, firstItem: 7, twoItems: 8, fullBuild: 8, summaryKey: "powerSpikes.summary.Lux" },
  Syndra: { level1to3: 5, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 9, summaryKey: "powerSpikes.summary.Syndra" },
  Orianna: { level1to3: 5, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summaryKey: "powerSpikes.summary.Orianna" },
  Lucian: { level1to3: 7, level4to6: 7, firstItem: 8, twoItems: 7, fullBuild: 6, summaryKey: "powerSpikes.summary.Lucian" },
  Sivir: { level1to3: 6, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summaryKey: "powerSpikes.summary.Sivir" },
  Draven: { level1to3: 7, level4to6: 8, firstItem: 9, twoItems: 8, fullBuild: 7, summaryKey: "powerSpikes.summary.Draven" },
};

export function getPowerSpikes(championId: string | undefined): PowerSpikeProfile | null {
  if (!championId) return null;
  return PROFILES[championId] ?? null;
}

// Returns i18n keys (resolved by the component via t()) so the bar labels +
// tooltips localize. Values are the per-window ratings from the profile.
export function powerSpikeBars(
  p: PowerSpikeProfile
): Array<{ labelKey: string; value: number; tooltipKey: string }> {
  return [
    { labelKey: "powerSpikes.bars.early.label", value: p.level1to3, tooltipKey: "powerSpikes.bars.early.tip" },
    { labelKey: "powerSpikes.bars.mid.label", value: p.level4to6, tooltipKey: "powerSpikes.bars.mid.tip" },
    { labelKey: "powerSpikes.bars.firstItem.label", value: p.firstItem, tooltipKey: "powerSpikes.bars.firstItem.tip" },
    { labelKey: "powerSpikes.bars.twoItems.label", value: p.twoItems, tooltipKey: "powerSpikes.bars.twoItems.tip" },
    { labelKey: "powerSpikes.bars.late.label", value: p.fullBuild, tooltipKey: "powerSpikes.bars.late.tip" },
  ];
}
