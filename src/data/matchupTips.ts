// Curated matchup-specific tips. Triggers when an enemy in your role is on
// this list. Each champion has parallel `es` / `en` arrays so the user
// gets tips in the language they picked for the AI Coach (prefs.aiCoachLanguage).
//
// New tips: add the same number of entries to both arrays. If you only
// have one language, paste the original into the other so callers never
// receive an empty list while we wait for a translation.

export type TipLang = "es" | "en";

export interface MatchupTip {
  versus: string;
  tip: string;
}

interface BilingualTips {
  es: string[];
  en: string[];
}

const TIPS: Record<string, BilingualTips> = {
  Yasuo: {
    es: [
      "No empujes la wave: minions altos = ulti enemiga gratis.",
      "Compra Executioner's o Bramble si tienes mucho lifesteal en su lado.",
      "Su windwall bloquea TODOS los proyectiles — engaña con auto antes de skill clave.",
    ],
    en: [
      "Don't push the wave: a high minion count means a free ult for him.",
      "Buy Executioner's or Bramble if there's lifesteal on his team.",
      "His Wind Wall blocks ALL projectiles — bait it with an auto before your key skill.",
    ],
  },
  Yone: {
    es: [
      "Mantén distancia con su E (no puede ulti contigo lejos).",
      "Después de su Q3 está vulnerable un segundo — punish.",
    ],
    en: [
      "Keep distance from his E — he can't ult if you're far.",
      "Right after his Q3 he's vulnerable for ~1s — punish.",
    ],
  },
  Zed: {
    es: [
      "Compra Stopwatch a los 5min (recipe Seeker's o Zhonya's).",
      "Si saca sombra cerca de ti, usa flash o dash perpendicular.",
    ],
    en: [
      "Buy Stopwatch by 5min (build into Seeker's or Zhonya's).",
      "If he places a shadow near you, flash or dash perpendicular.",
    ],
  },
  Akali: {
    es: [
      "Tu equipo necesita control wards rojos en cada fight (su shroud = invisible).",
      "Tras su E, tiene 2.5s sin recharge — punish.",
    ],
    en: [
      "Your team needs red Control Wards every fight (her shroud makes her invisible).",
      "After her E, she has 2.5s with no recast — punish that window.",
    ],
  },
  Darius: {
    es: [
      "No trades cuando tiene 5 stacks de pasiva — sangrarás.",
      "Stay away de su E (pull); pisa el borde exterior de su Q (heal mínimo).",
    ],
    en: [
      "Don't trade when he has 5 passive stacks — you'll bleed.",
      "Stay away from his E (pull); stand at the outer edge of his Q (minimal heal).",
    ],
  },
  Garen: {
    es: [
      "Compra Executioner's — su pasiva regen es brutal.",
      "Cancela su E con CC o disengage.",
    ],
    en: [
      "Buy Executioner's — his passive regen is brutal.",
      "Cancel his E with CC or disengage.",
    ],
  },
  Vayne: {
    es: [
      "No le des wall (3er stack de pasiva = stun + dmg).",
      "Burst antes del 3er stack — su tumble la hace inalcanzable.",
    ],
    en: [
      "Don't give her walls (3rd passive stack = stun + bonus dmg).",
      "Burst her before the 3rd stack — her tumble makes her untargetable.",
    ],
  },
  Riven: {
    es: [
      "Espera a que use Q3 + R antes de all-in.",
      "Compra armadura early (Plated Steelcaps + Bramble).",
    ],
    en: [
      "Wait until she dumps Q3 + R before all-inning.",
      "Buy armor early (Plated Steelcaps + Bramble).",
    ],
  },
  Camille: {
    es: [
      "Esquiva su E (wall hookshot) — sin él pierde mucho daño.",
      "Mantén distancia de paredes — su E te stunea contra ellas.",
    ],
    en: [
      "Dodge her E (wall hookshot) — without it she loses most kill pressure.",
      "Stay away from walls — her E stuns you against them.",
    ],
  },
  Fiora: {
    es: [
      "Stay away de paredes — su Q es ilimitada cerca.",
      "Bloquea sus vitals con stand atrás (no le des Q facil).",
    ],
    en: [
      "Stay off walls — her Q chains forever next to them.",
      "Block her vitals by repositioning so she can't free-Q them.",
    ],
  },
  Irelia: {
    es: [
      "No agrupes con minions — su Q es reset entre ellos.",
      "Compra Mercury's — sus E + R te encadenan.",
    ],
    en: [
      "Don't bunch up with minions — her Q resets between targets.",
      "Buy Mercury's Treads — her E + R chain CC you.",
    ],
  },
  Jax: {
    es: [
      "Stun antes de que use su E (3s de inmunidad a autos).",
      "Compra Bramble early para counter su sustain.",
    ],
    en: [
      "Stun him before he uses E (3s auto-attack immunity).",
      "Buy Bramble early to counter his sustain.",
    ],
  },
  Renekton: {
    es: [
      "Si tiene fury (3 stacks bar) se vuelve un asesino — bait el outplay.",
      "All-in cuando esté sin fury y W en CD.",
    ],
    en: [
      "When his Fury bar is full he's an assassin — bait the empowered combo.",
      "All-in when he's out of Fury and W is on cooldown.",
    ],
  },
  Sett: {
    es: [
      "Espera a que use su W (true dmg) antes de all-in.",
      "Su grab (E) ignora minions — anda con vision.",
    ],
    en: [
      "Wait until his W (true damage) is spent before all-inning.",
      "His grab (E) ignores minions — keep vision around you.",
    ],
  },
  Mordekaiser: {
    es: [
      "Compra QSS o Mercurial — su R te separa del equipo.",
      "Stay away de su E (pull) — te separa también.",
    ],
    en: [
      "Buy QSS or Mercurial — his R isolates you from your team.",
      "Stay away from his E (pull) — also a separator.",
    ],
  },
  Aatrox: {
    es: [
      "Su Q tiene sweet spot — pisa el borde para esquivar el knock.",
      "Compra Mortal Reminder o Executioner's contra su healing.",
    ],
    en: [
      "His Q has a sweet spot — stand at the edge to dodge the knock-up.",
      "Buy Mortal Reminder or Executioner's against his healing.",
    ],
  },
  Gangplank: {
    es: [
      "Rompe sus barriles con auto — punish con burst.",
      "Su Q al stun (curse stack) hace mucho daño — bait el Q.",
    ],
    en: [
      "Break his barrels with autos — punish with burst when he wastes one.",
      "His curse-stack Q deals huge damage — bait it out before trading.",
    ],
  },
  Ahri: {
    es: [
      "Esquiva su charm (E) — sin él pierde 60% kill pressure.",
      "Compra Banshee's después de mythic.",
    ],
    en: [
      "Dodge her Charm (E) — without it she loses 60% of kill pressure.",
      "Buy Banshee's Veil after your mythic.",
    ],
  },
  Syndra: {
    es: [
      "Aléjate de sus esferas — su E te stunea con cualquier toque.",
      "Su R es nuke de un solo target — mantente con tu equipo.",
    ],
    en: [
      "Stay away from her orbs — her E stuns through any of them.",
      "Her R is a single-target nuke — stay with your team.",
    ],
  },
  Orianna: {
    es: [
      "Maneja distancia a su ball — no quedes en su radio de shockwave.",
      "Sus E + flash R es la combo de teamfight — ward y disperse.",
    ],
    en: [
      "Mind your distance from her ball — don't sit inside her Shockwave radius.",
      "Flash + R is her teamfight combo — ward flanks and spread out.",
    ],
  },
  LeBlanc: {
    es: [
      "Compra QSS — su R chain CC te puede matar instant.",
      "Sigue a su clone con cuidado — su W return es escapatoria.",
    ],
    en: [
      "Buy QSS — her R chain CC can instant you.",
      "Track her clone — her W return is her escape.",
    ],
  },
  Talon: {
    es: [
      "Compra Stopwatch — su all-in es un nuke instant.",
      "Ward tu jungla — su pasiva trepa muros.",
    ],
    en: [
      "Buy Stopwatch — his all-in is an instant nuke.",
      "Ward your jungle — his passive lets him vault walls.",
    ],
  },
  Diana: {
    es: [
      "Cuando tenga 3 stacks de Q anda con cuidado — su E + R = burst lethal.",
      "Stay separated — su R hace AOE damage si te agrupas.",
    ],
    en: [
      "When she has 3 Q stacks be careful — her E + R combo is lethal.",
      "Stay spread — her R deals AoE if you bunch up.",
    ],
  },
  Katarina: {
    es: [
      "Mata sus daggers — sin pickup pierde el reset y daño.",
      "CC durante su R cancela — Banshee's contra primer stun.",
    ],
    en: [
      "Step on her daggers before she picks them up — kills her resets.",
      "Any CC on her ult cancels it — Banshee's stops the opening stun.",
    ],
  },
  Veigar: {
    es: [
      "Stay off su cage (E) — su stun a través te roba el flash + 2k daño.",
      "Compra MR temprano — escala con dmg infinito.",
    ],
    en: [
      "Stay off his Cage (E) — the stun on touching it costs you Flash + 2k damage.",
      "Buy MR early — he scales with infinite AP.",
    ],
  },
  Annie: {
    es: [
      "Cuenta sus stacks (4 = next spell stuns).",
      "Cuando esté con stun listo, no te acerques — bait el Q.",
    ],
    en: [
      "Count her stacks (4 = next spell stuns).",
      "When she has the stun ready, don't approach — bait the Q.",
    ],
  },
  Ekko: {
    es: [
      "Su R lo hace inmune — espera a que la use antes de focusear.",
      "Compra Executioner's — su pasiva heal es brutal.",
    ],
    en: [
      "His R makes him untargetable mid-cast — burn it before focusing.",
      "Buy Executioner's — his passive heal is massive.",
    ],
  },
  Sylas: {
    es: [
      "No usar tu R cuando esté cerca — la roba.",
      "Stay away durante su empowered Q (sustain + dmg alto).",
    ],
    en: [
      "Don't use your ult when he's nearby — he'll steal it.",
      "Stay back during his empowered Q (sustain + heavy damage).",
    ],
  },
  Caitlyn: {
    es: [
      "Mata sus trampas antes de que las pise alguien.",
      "Su net (E) tiene larga CD — punish con dash en CD.",
    ],
    en: [
      "Destroy her traps before someone steps on them.",
      "Her net (E) has a long CD — punish her while it's down.",
    ],
  },
  Draven: {
    es: [
      "Si suelta su axe, harass — sin pickup pierde dmg.",
      "Compra HP + armor temprano (Doran's Shield + Plated).",
    ],
    en: [
      "If he drops his Spinning Axe, harass — he loses damage without the pickup.",
      "Buy HP + armor early (Doran's Shield + Plated Steelcaps).",
    ],
  },
  Jhin: {
    es: [
      "Cuenta sus balas (4 = quinta es crit garantizada).",
      "Esquiva su W (1.5s wind-up) — visible y predecible.",
    ],
    en: [
      "Count his bullets (4 = the 4th shot is a guaranteed crit).",
      "Dodge his W (1.5s wind-up) — visible and predictable.",
    ],
  },
  Lucian: {
    es: [
      "Quédate atrás del minion (su passive dash necesita target cerca).",
      "Punish después de su Q + dash — está corto de mobility.",
    ],
    en: [
      "Hide behind minions — his passive dash needs a nearby target.",
      "Punish him right after his Q + dash — he has no escape for a moment.",
    ],
  },
  MissFortune: {
    es: [
      "Esquiva su double-up (Q) — sin él pierde poke.",
      "CC durante su R cancela — channel ult.",
    ],
    en: [
      "Dodge her Double Up (Q) — without it her poke disappears.",
      "Any CC on her ult cancels the channel.",
    ],
  },
  Twitch: {
    es: [
      "Compra Oracle/sweeper — su Q es invisibilidad.",
      "Pink wards en cada fight — su unstealth = mass dmg.",
    ],
    en: [
      "Buy an Oracle Lens / Sweeper — his Q is stealth.",
      "Pink wards before fights — he comes out of stealth with massive damage.",
    ],
  },
  Sivir: {
    es: [
      "Su E spell shield bloquea tu key skill — bait con dummy.",
      "Compra Edge of Night o early MR contra Sivir crit.",
    ],
    en: [
      "Her E Spell Shield blocks your key skill — bait it with a dummy cast.",
      "Buy Edge of Night or early MR against Sivir crit.",
    ],
  },
  Thresh: {
    es: [
      "Esquiva su hook (Q) — kill pressure principal.",
      "No quedes atrás cerca de minion — lantern boost gank.",
    ],
    en: [
      "Dodge his hook (Q) — that's his main kill pressure.",
      "Don't stand behind minions near him — his lantern enables jungle ganks.",
    ],
  },
  Leona: {
    es: [
      "Compra Mercury's — su CC chain es lethal sin tenacity.",
      "Stay away cuando esté lvl 6 + jungla cerca.",
    ],
    en: [
      "Buy Mercury's Treads — her CC chain is lethal without tenacity.",
      "Stay back when she hits 6 with her jungler nearby.",
    ],
  },
  Nautilus: {
    es: [
      "Esquiva su hook (Q) — 1 sec wind-up visible.",
      "Compra QSS si te chain CC.",
    ],
    en: [
      "Dodge his hook (Q) — visible 1s wind-up.",
      "Buy QSS if he chain-CCs you.",
    ],
  },
  Pyke: {
    es: [
      "Stay away de su Q (hook + slow) — escapatoria fácil con su E (stealth).",
      "Compra Mercury's — su R execute es lethal con CC.",
    ],
    en: [
      "Stay out of his Q range (hook + slow) — easy escape via his E (stealth).",
      "Buy Mercury's Treads — his R execute is lethal when chained with CC.",
    ],
  },
  Lulu: {
    es: [
      "Su W polymorph cancela tu key dash — bait antes de all-in.",
      "Hard CC al ADC adherido a su shield.",
    ],
    en: [
      "Her W polymorph cancels your key dash — bait it before all-inning.",
      "Hard CC the carry she's shielding.",
    ],
  },
  Janna: {
    es: [
      "Esquiva su Q (bubble lenta).",
      "All-in en bubble CD.",
    ],
    en: [
      "Dodge her Q (slow-moving Howling Gale).",
      "All-in while her Q is on cooldown.",
    ],
  },
  Rakan: {
    es: [
      "Ward para evitar su W engage (charge).",
      "Mercury's si te hace mucho CC.",
    ],
    en: [
      "Ward flanks to see his W engage (charge).",
      "Mercury's Treads if he keeps CCing you.",
    ],
  },
  Yuumi: {
    es: [
      "Hard CC al ADC adherido — Yuumi cae al unattach.",
      "Daña al ADC con burst — Yuumi heal no es suficiente.",
    ],
    en: [
      "Hard CC the carry she's attached to — Yuumi drops when she unattaches.",
      "Burst the carry — Yuumi's heal isn't enough.",
    ],
  },
  Zilean: {
    es: [
      "Esquiva su double bomb — se activa al pisar.",
      "Bait su ulti revive — focus después.",
    ],
    en: [
      "Dodge his double bomb — it triggers on second placement.",
      "Bait his revive ult — refocus the target after it pops.",
    ],
  },
};

export function getMatchupTips(
  _pickedChampionId: string | undefined,
  enemyChampionIds: (string | null | undefined)[],
  championIdToName: Map<string, string>,
  lang: TipLang = "es"
): MatchupTip[] {
  const out: MatchupTip[] = [];
  for (const enemyKey of enemyChampionIds) {
    if (!enemyKey) continue;
    const enemyName = championIdToName.get(enemyKey);
    if (!enemyName) continue;
    const entry = TIPS[enemyName];
    if (!entry) continue;
    // Fall back to Spanish if the English version is missing (shouldn't
    // happen but defensive — better a tip in the wrong language than no
    // tip at all).
    const tips = entry[lang] ?? entry.es;
    for (const tip of tips) {
      out.push({ versus: enemyName, tip });
    }
  }
  return out;
}
