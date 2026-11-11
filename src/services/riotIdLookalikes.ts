// Riot IDs with "fancy" letters mix alphabets: ÐΛΣRΣN looks all-Greek but
// ends in a Latin N. Typed by eye, the lookalike from the wrong alphabet
// (Greek Ν) gives a different Riot ID and a 404. These helpers produce the
// spellings worth retrying.

/** Greek / Cyrillic capitals and smalls that look like a Latin letter. */
const TO_LATIN: Record<string, string> = {
  // Greek
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N",
  Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X", ο: "o", ν: "v",
  // Cyrillic
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C",
  Т: "T", Х: "X", У: "Y", а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y",
};

/** Latin letter -> its Greek lookalike (the usual "fancy name" alphabet). */
const TO_GREEK: Record<string, string> = {
  A: "Α", B: "Β", E: "Ε", Z: "Ζ", H: "Η", I: "Ι", K: "Κ", M: "Μ", N: "Ν",
  O: "Ο", P: "Ρ", T: "Τ", Y: "Υ", X: "Χ",
};

const MAX_VARIANTS = 6;

/**
 * Other spellings of `name` that look the same on screen, most likely first:
 * every lookalike as Latin, every lookalike as Greek, then one letter swapped
 * at a time. Never includes `name` itself; capped so a miss costs a handful
 * of requests at most.
 */
export function riotIdLookalikes(name: string): string[] {
  const chars = [...name];
  const out: string[] = [];
  const add = (s: string) => {
    if (s !== name && !out.includes(s) && out.length < MAX_VARIANTS) out.push(s);
  };
  add(chars.map((c) => TO_LATIN[c] ?? c).join(""));
  // Only names that already use Greek letters are worth turning fully Greek.
  if (chars.some((c) => c >= "Ͱ" && c <= "Ͽ")) {
    add(chars.map((c) => TO_GREEK[c] ?? c).join(""));
  }
  chars.forEach((c, i) => {
    const swap = TO_LATIN[c] ?? TO_GREEK[c];
    if (swap) add([...chars.slice(0, i), swap, ...chars.slice(i + 1)].join(""));
  });
  return out;
}
