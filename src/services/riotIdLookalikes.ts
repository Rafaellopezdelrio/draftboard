// Riot IDs with "fancy" letters mix alphabets: ÐΛΣRΣN looks all-Greek but
// starts with an Icelandic Ð and ends in a Latin N. Typed by eye, a lookalike
// from another alphabet (Croatian Đ, Greek Ν, Latin Ʃ...) gives a different
// Riot ID and a 404. These helpers produce the spellings worth retrying.

/**
 * Characters that look the same on screen. First entry = the one fancy names
 * use most (Latin for plain letters, the Greek/Icelandic original for
 * symbols); the Greek twin of a Latin letter, when there is one, comes second.
 */
const GROUPS: string[][] = [
  // Symbols with no plain-Latin twin
  ["Ð", "Đ", "Ɖ"],
  ["Λ", "Ʌ", "∧"],
  ["Σ", "Ʃ", "∑"],
  ["Δ", "∆", "△"],
  ["Ω", "Ω"], // Greek Omega, Ohm sign
  ["Ø", "∅", "Φ"],
  ["ð", "đ"],
  // Latin letter, Greek twin, Cyrillic twin
  ["A", "Α", "А"],
  ["B", "Β", "В"],
  ["E", "Ε", "Е"],
  ["Z", "Ζ"],
  ["H", "Η", "Н"],
  ["I", "Ι", "І"],
  ["K", "Κ", "К"],
  ["M", "Μ", "М"],
  ["N", "Ν"],
  ["O", "Ο", "О"],
  ["P", "Ρ", "Р"],
  ["T", "Τ", "Т"],
  ["Y", "Υ", "У"],
  ["X", "Χ", "Х"],
  ["C", "Ϲ", "С"],
  ["a", "а"],
  ["e", "е"],
  ["o", "ο", "о"],
  ["p", "р"],
  ["c", "с"],
  ["x", "х"],
  ["y", "у"],
  ["v", "ν"],
];

const GROUP_OF = new Map<string, string[]>();
for (const g of GROUPS) for (const c of g) GROUP_OF.set(c, g);

const MAX_VARIANTS = 10;
const isGreek = (c: string) => c >= "Ͱ" && c <= "Ͽ";

/**
 * Other spellings of `name` that look the same on screen, most likely first:
 * every lookalike in its usual form, the all-Greek reading (for names that
 * already use Greek), then one character swapped at a time. Never includes
 * `name` itself; capped so a miss costs a handful of requests at most.
 */
export function riotIdLookalikes(name: string): string[] {
  const chars = [...name];
  const out: string[] = [];
  const add = (s: string) => {
    if (s !== name && !out.includes(s) && out.length < MAX_VARIANTS) out.push(s);
  };
  add(chars.map((c) => GROUP_OF.get(c)?.[0] ?? c).join(""));
  if (chars.some(isGreek)) {
    add(
      chars
        .map((c) => {
          const g = GROUP_OF.get(c);
          return g ? (g.find(isGreek) ?? g[0]) : c;
        })
        .join("")
    );
  }
  chars.forEach((c, i) => {
    for (const alt of GROUP_OF.get(c) ?? []) {
      if (alt !== c) add([...chars.slice(0, i), alt, ...chars.slice(i + 1)].join(""));
    }
  });
  return out;
}
