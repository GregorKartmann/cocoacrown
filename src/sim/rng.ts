/**
 * Deterministic PRNG (mulberry32). The state is stored in the save game so
 * reloading never re-rolls manager rarities or bonus events.
 */
export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: { rng: number }, maxExclusive: number): number {
  return Math.floor(nextRandom(state) * maxExclusive);
}

export function weightedPick<T extends { weight: number }>(state: { rng: number }, items: readonly T[]): number {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = nextRandom(state) * total;
  for (let i = 0; i < items.length; i++) {
    r -= items[i].weight;
    if (r < 0) return i;
  }
  return items.length - 1;
}

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  }
  return (Math.random() * 4294967296) >>> 0;
}
