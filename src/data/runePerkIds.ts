// Rune NAME → numeric perk ID (DataDragon ids). op.gg's scraped
// `runes.primaryRunes[]` and `runes.secondaryRunes[]` are strings (e.g.
// "Conqueror", "Triumph") — without this map we couldn't render the
// official perk icons, which is the dominant visual cue on Mobalytics
// and the killer feature this UI was missing.
//
// IDs sourced from Riot's perks-and-styles endpoint (stable across
// patches for years; new keystones append rather than re-number). Add
// new runes as Riot ships them — they go to the bottom; never re-order.
//
// We intentionally only include the most common 60-ish runes so a typo
// or unmapped name falls through gracefully to a text label rather than
// rendering the wrong icon.

export const RUNE_NAME_TO_PERK_ID: Record<string, number> = {
  // ---------- Precision (8000) ----------
  "Press the Attack": 8005,
  "PressTheAttack": 8005,
  "Presencia de Espíritu": 8005, // Spanish locale of op.gg
  "Lethal Tempo": 8008,
  "LethalTempo": 8008,
  "Fleet Footwork": 8021,
  "FleetFootwork": 8021,
  "Pies Veloces": 8021,
  "Conqueror": 8010,
  "Conquistador": 8010,
  "Overheal": 9101,
  "Triumph": 9111,
  "Triunfo": 9111,
  "Presence of Mind": 8009,
  "Presencia de Mente": 8009,
  "Legend: Alacrity": 9104,
  "Leyenda: Premura": 9104,
  "Legend: Tenacity": 9105,
  "Leyenda: Tenacidad": 9105,
  "Legend: Bloodline": 9103,
  "Leyenda: Linaje": 9103,
  "Coup de Grace": 8014,
  "Golpe de Gracia": 8014,
  "Cut Down": 8017,
  "Recorte": 8017,
  "Last Stand": 8299,
  "Resistencia": 8299,

  // ---------- Domination (8100) ----------
  "Electrocute": 8112,
  "Electrocutar": 8112,
  "Predator": 8124,
  "Depredador": 8124,
  "Dark Harvest": 8128,
  "Cosecha Sombría": 8128,
  "Hail of Blades": 9923,
  "Granizo de Cuchillas": 9923,
  "Cheap Shot": 8126,
  "Golpe Bajo": 8126,
  "Taste of Blood": 8139,
  "Sabor a Sangre": 8139,
  "Sudden Impact": 8143,
  "Impacto Súbito": 8143,
  "Sixth Sense": 8137,
  "Sexto Sentido": 8137,
  "Grisly Mementos": 8140,
  "Recuerdos Sangrientos": 8140,
  "Deep Ward": 8141,
  "Centinela Sombrío": 8141,
  "Treasure Hunter": 8135,
  "Cazador de Tesoros": 8135,
  "Relentless Hunter": 8105,
  "Cazador Implacable": 8105,
  "Ultimate Hunter": 8106,
  "Cazador Definitivo": 8106,

  // ---------- Sorcery (8200) ----------
  "Summon Aery": 8214,
  "Invocar Aery": 8214,
  "Arcane Comet": 8229,
  "Cometa Arcano": 8229,
  "Phase Rush": 8230,
  "Aceleración Súbita": 8230,
  "Nullifying Orb": 8224,
  "Orbe Nulificador": 8224,
  "Manaflow Band": 8226,
  "Banda de Maná": 8226,
  "Nimbus Cloak": 8275,
  "Manto de Nimbo": 8275,
  "Transcendence": 8210,
  "Trascendencia": 8210,
  "Celerity": 8234,
  "Celeridad": 8234,
  "Absolute Focus": 8233,
  "Foco Absoluto": 8233,
  "Scorch": 8237,
  "Chamuscar": 8237,
  "Waterwalking": 8232,
  "Andar sobre las Aguas": 8232,
  "Gathering Storm": 8236,
  "Tormenta Inminente": 8236,
  "Axiom Arcanist": 8369,
  "Axiomática Arcanista": 8369,

  // ---------- Resolve (8400) ----------
  "Grasp of the Undying": 8437,
  "Garra del Inmortal": 8437,
  "Aftershock": 8439,
  "Onda Sísmica": 8439,
  "Guardian": 8465,
  "Guardián": 8465,
  "Demolish": 8446,
  "Demoler": 8446,
  "Font of Life": 8463,
  "Fuente de Vida": 8463,
  "Shield Bash": 8401,
  "Embate del Escudo": 8401,
  "Conditioning": 8429,
  "Acondicionamiento": 8429,
  "Second Wind": 8444,
  "Segundo Aliento": 8444,
  "Bone Plating": 8473,
  "Coraza Ósea": 8473,
  "Overgrowth": 8451,
  "Crecimiento Excesivo": 8451,
  "Revitalize": 8453,
  "Revitalizar": 8453,
  "Unflinching": 8242,
  "Inquebrantable": 8242,

  // ---------- Inspiration (8300) ----------
  "Glacial Augment": 8351,
  "Beneficio Glaciar": 8351,
  "Unsealed Spellbook": 8360,
  "Grimorio Sellado": 8360,
  "First Strike": 8369,
  "Primer Golpe": 8369,
  "Hextech Flashtraption": 8306,
  "Flashtrapación Hextech": 8306,
  "Magical Footwear": 8304,
  "Calzado Mágico": 8304,
  "Cash Back": 8321,
  "Reembolso": 8321,
  "Triple Tonic": 8313,
  "Tónico Triple": 8313,
  "Time Warp Tonic": 8352,
  "Distorsión Temporal": 8352,
  "Biscuit Delivery": 8345,
  "Entrega de Galletas": 8345,
  "Cosmic Insight": 8347,
  "Conocimiento Cósmico": 8347,
  "Approach Velocity": 8410,
  "Velocidad de Aproximación": 8410,
  "Jack Of All Trades": 8316,
  "Todoterreno": 8316,

  // ---------- Stat shards (5000+) ----------
  "Adaptive Force": 5008,
  "Fuerza Adaptable": 5008,
  "Attack Speed": 5005,
  "Velocidad de Ataque": 5005,
  "Ability Haste": 5007,
  "Aceleración de Habilidad": 5007,
  "Health Scaling": 5001,
  "Salud Escalada": 5001,
  "Flat Health": 5011,
  "Salud Plana": 5011,
  "Tenacity and Slow Resist": 5013,
  "Tenacidad y Resistencia a Ralentizaciones": 5013,
  "Armor": 5002,
  "Armadura": 5002,
  "Magic Resist": 5003,
  "Resistencia Mágica": 5003,
};

/**
 * Resolve a rune name to its DataDragon perk ID. Returns null for
 * unknown names so the caller can fall back to text instead of
 * rendering a broken icon. Case-insensitive lookup so locale and
 * casing inconsistencies in scraped names still match.
 */
export function lookupPerkId(name: string | undefined): number | null {
  if (!name) return null;
  if (RUNE_NAME_TO_PERK_ID[name] !== undefined) return RUNE_NAME_TO_PERK_ID[name];
  // Case-insensitive fallback
  const lower = name.toLowerCase();
  for (const k of Object.keys(RUNE_NAME_TO_PERK_ID)) {
    if (k.toLowerCase() === lower) return RUNE_NAME_TO_PERK_ID[k];
  }
  return null;
}
