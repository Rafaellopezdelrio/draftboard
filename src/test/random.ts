// Seeded random data for property tests. A new seed every run (so the tests
// never settle into the same few cases — the "pesticide paradox"), printed in
// every failure message so a red run can be replayed: PROP_SEED=<seed>.
export const PROP_SEED = Number(process.env.PROP_SEED) || Date.now() % 2_147_483_647;

export function rng(seed = PROP_SEED) {
  let s = seed >>> 0 || 1;
  const next = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    float: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  };
}
