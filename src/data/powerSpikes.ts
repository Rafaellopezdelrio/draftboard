// Champion power spike profiles. Tells the user when a champion is strong/weak.

export interface PowerSpikeProfile {
  // 0-10 strength rating per timing window
  level1to3: number;
  level4to6: number;
  firstItem: number;
  twoItems: number;
  fullBuild: number;
  // Single-line summary for UI
  summary: string;
}

const PROFILES: Record<string, PowerSpikeProfile> = {
  Yasuo: { level1to3: 5, level4to6: 6, firstItem: 8, twoItems: 9, fullBuild: 8, summary: "Débil hasta IE+PD, monstruo con 2 items crit" },
  Yone: { level1to3: 4, level4to6: 6, firstItem: 7, twoItems: 9, fullBuild: 8, summary: "Pico fuerte con IE; abusa antes" },
  Zed: { level1to3: 5, level4to6: 9, firstItem: 8, twoItems: 9, fullBuild: 7, summary: "Pico level 6, presión total con first item" },
  Ahri: { level1to3: 5, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 8, summary: "Roams desde 6, late muy versátil" },
  Akali: { level1to3: 4, level4to6: 6, firstItem: 8, twoItems: 9, fullBuild: 8, summary: "Pico con first item completo, débil pre-6" },
  Katarina: { level1to3: 5, level4to6: 7, firstItem: 9, twoItems: 9, fullBuild: 8, summary: "Snowball brutal con un kill, débil sin él" },
  Veigar: { level1to3: 3, level4to6: 5, firstItem: 6, twoItems: 8, fullBuild: 10, summary: "Hyperscaler — sobrevive y verás 10/10 late" },
  Darius: { level1to3: 7, level4to6: 9, firstItem: 8, twoItems: 7, fullBuild: 6, summary: "Bully early — gana lane antes de minuto 14" },
  Garen: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summary: "Constante — fuerte siempre, no pico claro" },
  Nasus: { level1to3: 2, level4to6: 4, firstItem: 6, twoItems: 8, fullBuild: 10, summary: "Hyperscaler con stacks Q. Aguanta y arrasa" },
  Vayne: { level1to3: 3, level4to6: 5, firstItem: 6, twoItems: 8, fullBuild: 10, summary: "Hyperscaler ADC. Pico con 3 items" },
  Tryndamere: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 9, summary: "Pico nivel 6 con ulti, splitpush hasta el fin" },
  MasterYi: { level1to3: 4, level4to6: 6, firstItem: 8, twoItems: 10, fullBuild: 10, summary: "Inútil sin items, monstruo con 2-3" },
  Caitlyn: { level1to3: 7, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summary: "Bully de lane, pico early-mid" },
  Jinx: { level1to3: 4, level4to6: 5, firstItem: 7, twoItems: 9, fullBuild: 10, summary: "Hyperscaler ADC. Pico con 3 items" },
  Kaisa: { level1to3: 4, level4to6: 6, firstItem: 8, twoItems: 9, fullBuild: 9, summary: "Pico con first item, escala bien" },
  MissFortune: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summary: "Bully bot lane, ulti fuerte siempre" },
  Ezreal: { level1to3: 5, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summary: "Pico con Triforce/Manamune, late safe" },
  Ashe: { level1to3: 5, level4to6: 7, firstItem: 7, twoItems: 8, fullBuild: 8, summary: "Ulti = pico de mapa desde lvl 6" },
  Lulu: { level1to3: 6, level4to6: 7, firstItem: 7, twoItems: 7, fullBuild: 8, summary: "Enchanter constante, escala con ADC" },
  Thresh: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 8, fullBuild: 8, summary: "Pico inmediato, hook = kill desde lvl 1" },
  Leona: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 7, fullBuild: 6, summary: "Engage brutal early, escala mal" },
  Nautilus: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 8, fullBuild: 7, summary: "All-in fuerte siempre, mejor con CDR" },
  Senna: { level1to3: 6, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 10, summary: "Hyperscaler con stacks, late infinito" },
  Soraka: { level1to3: 5, level4to6: 7, firstItem: 7, twoItems: 8, fullBuild: 9, summary: "Sustain crece con AP, late tanky" },
  Pyke: { level1to3: 6, level4to6: 8, firstItem: 8, twoItems: 8, fullBuild: 7, summary: "Pico nivel 6 con ulti reset, roamea" },
  Janna: { level1to3: 6, level4to6: 6, firstItem: 7, twoItems: 7, fullBuild: 8, summary: "Disengage maestra, escala con shields" },
  Morgana: { level1to3: 5, level4to6: 7, firstItem: 7, twoItems: 8, fullBuild: 8, summary: "Q stun = kill, ulti win-fight con tanks" },
  Blitzcrank: { level1to3: 7, level4to6: 7, firstItem: 7, twoItems: 7, fullBuild: 6, summary: "Picos de lane temprano por hooks" },
  Briar: { level1to3: 6, level4to6: 8, firstItem: 9, twoItems: 9, fullBuild: 8, summary: "Jungla-ganker brutal con first item" },
  Warwick: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 7, fullBuild: 6, summary: "Gank kit perfecto early, escala mal" },
  Diana: { level1to3: 5, level4to6: 8, firstItem: 9, twoItems: 9, fullBuild: 8, summary: "Pico nivel 6 + first item devastador" },
  Hecarim: { level1to3: 4, level4to6: 6, firstItem: 7, twoItems: 9, fullBuild: 9, summary: "Mid-late game power spike con 2 items" },
  XinZhao: { level1to3: 6, level4to6: 8, firstItem: 8, twoItems: 8, fullBuild: 7, summary: "Skirmish king en early-mid" },
  Graves: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 8, summary: "Constante, mejor con first item AD" },
  LeeSin: { level1to3: 7, level4to6: 8, firstItem: 7, twoItems: 6, fullBuild: 5, summary: "Early dominante — make plays minuto 1-15" },
  Kayn: { level1to3: 5, level4to6: 6, firstItem: 9, twoItems: 9, fullBuild: 8, summary: "Pico cuando completa forma + first item" },
  Lillia: { level1to3: 5, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summary: "Power farm; escala bien late" },
  Nocturne: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summary: "Ulti = kill desde lvl 6 + first item" },
  Sett: { level1to3: 7, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 7, summary: "Lane bully, escala decente" },
  Mordekaiser: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 8, summary: "Power 6 con ulti, escala bien" },
  Camille: { level1to3: 6, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 8, summary: "Pico con Triforce/Sheen, splitpusher" },
  Fiora: { level1to3: 5, level4to6: 7, firstItem: 8, twoItems: 9, fullBuild: 8, summary: "Escala con items, late 1v1 imbatible" },
  Jax: { level1to3: 4, level4to6: 6, firstItem: 7, twoItems: 9, fullBuild: 9, summary: "Hyperscaler bruiser, débil pre-6" },
  Renekton: { level1to3: 7, level4to6: 8, firstItem: 8, twoItems: 7, fullBuild: 6, summary: "Bully pre-6, escala mal" },
  Gwen: { level1to3: 4, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summary: "Power farm hasta items, late muy fuerte" },
  Yorick: { level1to3: 5, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summary: "Splitpush king, late 1v1" },
  Lux: { level1to3: 6, level4to6: 7, firstItem: 7, twoItems: 8, fullBuild: 8, summary: "Burst constante, ulti spam late" },
  Syndra: { level1to3: 5, level4to6: 7, firstItem: 8, twoItems: 8, fullBuild: 9, summary: "Pico con first item, late assassin" },
  Orianna: { level1to3: 5, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summary: "Mid-late teamfight queen" },
  Lucian: { level1to3: 7, level4to6: 7, firstItem: 8, twoItems: 7, fullBuild: 6, summary: "Lane bully + early-mid, falla late" },
  Sivir: { level1to3: 6, level4to6: 6, firstItem: 7, twoItems: 8, fullBuild: 9, summary: "Wave clear infinito, escala bien" },
  Draven: { level1to3: 7, level4to6: 8, firstItem: 9, twoItems: 8, fullBuild: 7, summary: "Snowball ADC — gana early o pierde late" },
};

export function getPowerSpikes(championId: string | undefined): PowerSpikeProfile | null {
  if (!championId) return null;
  return PROFILES[championId] ?? null;
}

export function powerSpikeBars(p: PowerSpikeProfile): Array<{ label: string; value: number; tooltip: string }> {
  return [
    { label: "1-3", value: p.level1to3, tooltip: "Niveles 1-3: pre-jungla, lane phase early" },
    { label: "4-6", value: p.level4to6, tooltip: "Niveles 4-6: pre-ulti / pre-first item" },
    { label: "1 ítem", value: p.firstItem, tooltip: "Con primer ítem core completo" },
    { label: "2 ítems", value: p.twoItems, tooltip: "Mid game, 2-3 items" },
    { label: "Late", value: p.fullBuild, tooltip: "Late game / build completo" },
  ];
}
