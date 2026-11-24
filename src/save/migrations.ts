/**
 * Save migrations. Each entry upgrades plain save data from version N to N+1.
 * Rules: never delete player progress, give new fields safe defaults, keep
 * migrations pure so they can be unit-tested with old fixtures.
 *
 * Version history
 *   1 – first public vertical slice (Manufaktur, 5 Etagen)
 *   2 – prestige "Marke verkaufen" (crowns), manager home stations, smooth tap time
 *   3 – floors 6–8 (appended locked), Rezeptlabor (research state; the lab
 *       opens right away if the 3rd floor already stands)
 */
import { BALANCE } from '../config/balance';

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
  2: (d) => {
    const floors = Array.isArray(d.floors) ? [...(d.floors as Record<string, unknown>[])] : [];
    while (floors.length < 8) {
      floors.push({ unlocked: false, level: 1, progress: 0, running: false, buffer: '0', managerId: null, stalled: false, tapBudget: 6, rush: 0 });
    }
    const third = floors[2] as { unlocked?: boolean } | undefined;
    const prestige = (d.prestige ?? {}) as { runs?: number };
    // Starting credit: the Rezeptpunkte this run would have earned so far.
    const reached = (list: readonly { level: number }[], level: unknown) => list.filter((m) => typeof level === 'number' && m.level <= level).length;
    let points = 0;
    for (const f of floors as { unlocked?: boolean; level?: number }[]) if (f.unlocked) points += 1 + reached(BALANCE.floorMilestones, f.level);
    points += reached(BALANCE.lift.milestones, (d.lift as { level?: number } | undefined)?.level);
    points += reached(BALANCE.shipping.milestones, (d.ship as { level?: number } | undefined)?.level);
    points += Math.min(50, Number((d.quest as { index?: number } | undefined)?.index ?? 0) || 0);
    return {
      ...d,
      floors,
      research: { points, earned: points, ranks: {}, active: null, open: !!third?.unlocked || (prestige.runs ?? 0) > 0 },
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
