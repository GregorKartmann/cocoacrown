/**
 * Save migrations. Each entry upgrades plain save data from version N to N+1.
 * Rules: never delete player progress, give new fields safe defaults, keep
 * migrations pure so they can be unit-tested with old fixtures.
 *
 * Version history
 *   1 – first public vertical slice (Manufaktur, 5 Etagen)
 *   2 – prestige "Marke verkaufen" (crowns), manager home stations, smooth tap time
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  1: (d) => {
    const stats = (d.stats ?? {}) as Record<string, unknown>;
    return {
      ...d,
      // A v1 player has never sold the brand: the current run started with the game.
      prestige: { crowns: 0, runs: 0, runStartEarned: '0', runStartPlay: 0, bestFloor5: null },
      managers: Array.isArray(d.managers) ? d.managers.map((m) => ({ ...(m as object), home: null })) : d.managers,
      stats,
    };
  },
};

export function migrate(
  data: Record<string, unknown>,
  from: number,
  to: number,
  migrations: Record<number, Migration> = MIGRATIONS,
): Record<string, unknown> {
  let d = data;
  for (let v = from; v < to; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`Keine Migration von Version ${v} auf ${v + 1}.`);
    d = m(d);
  }
  return d;
}
