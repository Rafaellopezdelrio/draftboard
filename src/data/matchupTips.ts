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
  Riven: [
    "Sus 3 stacks de Q + auto = burst máximo. Stay max range entre cooldowns.",
    "Bait su W (stun melee) y punish.",
    "Compra plated steelcaps + grasp/cleaver bruisers.",
  ],
  Irelia: [
    "No le des minions a stackear pasiva.",
    "Cuidado con su E (stun double-wave). Espera el primero, evita el segundo.",
    "Punish después de su Q a un minion fuera del trade.",
  ],
  Camille: [
    "Cuidado con su E (charge wall). Stay open ground en early.",
    "Su ulti te aísla — saca QSS o tira flash perpendicular.",
  ],
  Jax: [
    "Cuidado nivel 6 — counter-strike (E) refleja autos. Usa skills entre.",
    "Bramble Vest si tiene mucha lifesteal.",
  ],
  Fiora: [
    "No te quedes contra terreno — su ulti vital reset es brutal.",
    "Bait su W (parry) con auto, luego skill clave.",
  ],
  Aatrox: [
    "Esquiva la 3ª Q (la del centro) — es la que más daño hace.",
    "Bait su ulti con sumas; vuelve cuando expire.",
  ],
  Olaf: [
    "Su ulti es immune a CC. No intentes peelearlo con CC en él.",
    "Kite con range — no puede resistir poke prolongado.",
  ],
  Quinn: [
    "Punish su ulti — está canalizando, vulnerable.",
    "Mantén distancia, su Q (blind) te jode autos.",
  ],
  Teemo: [
    "Compra Sweeper (oracle lens) — limpia shrooms.",
    "Mercury's contra blind + slow; QSS si rankeas top.",
  ],
  Singed: [
    "No le persigas — gana 100% de las chase fights.",
    "Wait para gankear cuando se queda sin mana.",
  ],
  Volibear: [
    "Stay away en 1v1 lvl 6+ (ulti hace true damage).",
    "QSS contra su E (stun proyectil rapido).",
  ],
  Cassiopeia: [
    "Mercury's es obligado.",
    "Esquiva su R (face-stun) — gírale espalda.",
  ],
  Vladimir: [
    "Bull botellas + executioner ASAP.",
    "All-in cuando esté en pool CD.",
  ],
  Anivia: [
    "Esquiva su Q (cooldown grande). Luego es free trade.",
    "Vigila su huevo — no la termines si tu equipo está lejos.",
  ],
  Annie: [
    "Cuenta sus stacks de pasiva (4 = stun garantizado).",
    "Cuando tenga 3 stacks, no te acerques.",
  ],
  Brand: [
    "Esquiva su W (skillshot lento). Sin él no tiene burst.",
    "Compra MR temprano si juegas botlane.",
  ],
  Karthus: [
    "Rusha QSS si juegas bot — su ulti late = kill garantizado.",
    "All-in jungla pre-6.",
  ],
  Kassadin: [
    "Punish hard pre-6, es free farm.",
    "Mercury's + spread post-16.",
  ],
  Lissandra: [
    "Esquiva su E (engage telegrafiado).",
    "Su ulti la hace untargetable — no gastes spell ahí.",
  ],
  Malzahar: [
    "QSS obligado contra su ulti suppress.",
    "Pre-6 es débil — punish.",
  ],
  Ryze: [
    "Pre-tier 2 boots es débil. Punish nivel 1-5.",
    "Cuidado con su W (root) tras 3 spells combo.",
  ],
  Sylas: [
    "Cuidado con su E (stun chain). Evita mid range.",
    "Su ulti roba la tuya — piensa qué le das.",
  ],
  Talon: [
    "Pink wards en jungla — su pasiva true dmg + roams.",
    "All-in cuando esté sin Q.",
  ],
  Twisted: [
    "Track su ulti cooldown — gankea en otro lado cuando esté en CD.",
    "Mercury's contra su gold card stun.",
  ],
  Viktor: [
    "Esquiva su E laser — sin él no hace daño.",
    "Stay spread vs ulti — burnea AoE.",
  ],
  Xerath: [
    "Sidestep — todo skillshot. Practica esquivar.",
    "All-in en CD spike.",
  ],
  Aphelios: [
    "Cuenta sus armas — castígale en switches.",
    "All-in en su debilidad: Calibrum (poke arma) en short range.",
  ],
  Jhin: [
    "Cuenta sus 4 balas — la 4ª crit es predecible.",
    "Esquiva su W root (skillshot que pasa por minions con marca).",
  ],
  Twitch: [
    "Wards en bushes — es invisible early.",
    "Pink wards después de 6.",
  ],
  Kalista: [
    "Punish su mana baja — tiene mucha en early.",
    "QSS o spread vs ulti push de su sup.",
  ],
  Samira: [
    "Stay spaced — necesita stacks contiguos para ulti.",
    "Hard CC durante su ulti = la mata.",
  ],
  Smolder: [
    "Hyperscaler — kill antes de minuto 20 o pierdes.",
    "All-in pre-6.",
  ],
  Varus: [
    "Cancela su Q charge con CC.",
    "Mercury's si va lethality (root + R)",
  ],
  Xayah: [
    "Su ulti = invulnerable + reposiciona — no la engagees con todo dumped.",
    "Esquiva las plumas que vuelven — son root si tocan 3.",
  ],
  Zeri: [
    "Pinea sus paredes (E) — castígala cuando wall-jump CD.",
    "Hard CC interrumpe su ulti.",
  ],
  Kaisa: [
    "Stay spread en teamfight — gana con ulti dive single target.",
    "Pink wards — invisible su evolution.",
  ],
  Bard: [
    "Cuidado con sus chimes — gana lvl 3 con stun.",
    "Esquiva su ulti dorado (stasis lento).",
  ],
  Karma: [
    "Pre-6 es débil — punish levels 1-3.",
    "Su Q a través de RW es el daño real — esquívalo.",
  ],
  Lux: [
    "Esquiva su Q (binding) — sin ello no encadena combo.",
    "All-in en Q CD.",
  ],
  Nami: [
    "Esquiva su Q (bubble lenta).",
    "All-in en bubble CD.",
  ],
  Rakan: [
    "Ward para evitar su W engage (charge).",
    "Mercury's si te hace mucho CC.",
  ],
  Yuumi: [
    "Hard CC al ADC adherido — Yuumi cae al unattach.",
    "Daña al ADC con burst — Yuumi heal no es suficiente.",
  ],
  Zilean: [
    "Esquiva su double bomb — se activa al pisar.",
    "Bait su ulti revive — focus después.",
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
