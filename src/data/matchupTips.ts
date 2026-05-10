// Curated matchup-specific tips. Triggers when an enemy in your role is on this list.
// Format: enemy champion id -> tips for fighting them.

export interface MatchupTip {
  versus: string;
  tip: string;
}

const TIPS: Record<string, string[]> = {
  Yasuo: [
    "No empujes la wave: minions altos = ulti enemiga gratis.",
    "Compra Executioner's o Bramble si tienes mucho lifesteal en su lado.",
    "Su windwall bloquea TODOS los proyectiles — engaña con auto antes de skill clave.",
  ],
  Yone: [
    "Mantén distancia con su E (no puede ulti contigo lejos).",
    "Después de su Q3 está vulnerable un segundo — punish.",
  ],
  Zed: [
    "Compra Stopwatch a los 5min (recipe Seeker's o Zhonya's).",
    "Si saca sombra cerca de ti, usa flash o dash perpendicular.",
  ],
  Akali: [
    "Tu equipo necesita rojo control wards en cada fight (su shroud = invisible).",
    "Tras su E, tiene 2.5s sin recharge — punish.",
  ],
  Darius: [
    "No trades cuando tiene 5 stacks de pasiva — sangrarás.",
    "Stay away de su E (pull); pisa el borde exterior de su Q (heal mínimo).",
  ],
  Garen: [
    "Compra Executioner's — su pasiva regen es brutal.",
    "Cancela su E con CC o disengage.",
  ],
  Vayne: [
    "Punish nivel 1-5 (es muy débil).",
    "Compra armor temprano si juegas tank top.",
  ],
  Tryndamere: [
    "Bait su ulti (E para escapar, vuelve cuando expire).",
    "Compra Executioner's — heal y crit altísimos.",
  ],
  MasterYi: [
    "Hard CC durante su Q (te ignora dmg pero no CC en parámetro tras Q).",
    "Compra Frozen Heart / Randuin's para reducir su attack speed.",
  ],
  Katarina: [
    "Ban o respeta su reset — UNA muerte a su lado y multikill.",
    "Hard CC interrumpe su ulti.",
  ],
  Veigar: [
    "Sus E (jaula) es la skill clave — flashea fuera o esquívala.",
    "Después de su E está sin damage hasta cooldown.",
  ],
  Malphite: [
    "Compra Mercury's contra su ulti.",
    "Spread del equipo en teamfights — su ulti pillará a 1 si están separados.",
  ],
  Leona: [
    "Mantén distancia en lvl 2-3 (puede engage con E).",
    "Compra Mercury's si juegas botlane carry.",
  ],
  Nautilus: [
    "Su Q tiene long CD — punish después.",
    "El primer hit auto stunea — no te le acerques sin escape.",
  ],
  Pyke: [
    "Stay together — su ulti hace reset a partir de cierto HP.",
    "Compra Vigilant Wardstone o crowd control vs su pull.",
  ],
  Zoe: [
    "Su E (sleep) es la única amenaza real — no la dejes acertarte.",
    "Si tira summoner spell suya cerca, recógela tú.",
  ],
  Diana: [
    "Punish antes de nivel 6 (sin engage).",
    "QSS contra su pull (R).",
  ],
  Elise: [
    "Cuidado con cocoon (E) — interrumpe todo.",
    "Mantén al equipo agrupado — su araña es burst single target.",
  ],
  LeeSin: [
    "Ward la jungla en early — su pico es lvl 3-6.",
    "Tras Q1 tiene window, esquiva Q2.",
  ],
  Kayn: [
    "Si va Rhaast, kite (sus daños son melee).",
    "Si va Shadow, hard CC interrumpe ulti.",
  ],
};

export function getMatchupTips(
  _pickedChampionId: string | undefined,
  enemyChampionIds: (string | null | undefined)[],
  championIdToName: Map<string, string>
): MatchupTip[] {
  const out: MatchupTip[] = [];
  for (const enemyKey of enemyChampionIds) {
    if (!enemyKey) continue;
    const enemyName = championIdToName.get(enemyKey);
    if (!enemyName) continue;
    const tips = TIPS[enemyName];
    if (!tips) continue;
    for (const tip of tips) {
      out.push({ versus: enemyName, tip });
    }
  }
  return out;
}
