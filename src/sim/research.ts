import { LAB_FLOOR, OFFLINE_HOURS, RESEARCH, RESEARCH_BY_ID, RESEARCH_POINTS, type ResearchId } from '../config/research';
import type { GameState, ResearchState, SimContext } from './types';

/* ------------------------------------------------------------------------- */
/* State                                                                      */
/* ------------------------------------------------------------------------- */

export function defaultResearch(): ResearchState {
  const ranks = {} as Record<ResearchId, number>;
  for (const n of RESEARCH) ranks[n.id] = 0;
  return { points: 0, earned: 0, ranks, active: null, open: false };
}

export function rank(s: GameState, id: ResearchId): number {
  return s.research.ranks[id] ?? 0;
}

/* ------------------------------------------------------------------------- */
/* Effects (all 1 at rank 0)                                                  */
/* ------------------------------------------------------------------------- */

export const R = {
  floorSpeed: (s: GameState) => 1 + 0.06 * rank(s, 'schnellere_zyklen'),
  floorCost: (s: GameState) => 1 - 0.05 * rank(s, 'waermefuehrung'),
  floorYield: (s: GameState) => 1 + 0.25 * rank(s, 'chargengroesse'),
  shipCapacity: (s: GameState) => 1 + 0.1 * rank(s, 'lieferflotte'),
  buffer: (s: GameState) => 1 + 0.3 * rank(s, 'lagerkapazitaet'),
  offlineSeconds: (s: GameState) => OFFLINE_HOURS[Math.min(OFFLINE_HOURS.length - 1, rank(s, 'lagerkapazitaet'))] * 3600,
  logisticsSpeed: (s: GameState) => 1 + 0.15 * rank(s, 'routenplanung'),
  researchTime: (s: GameState) => 1 - 0.08 * rank(s, 'rezeptentwicklung'),
  goldenInterval: (s: GameState) => 1 - 0.06 * rank(s, 'qualitaetskontrolle'),
  goldenReward: (s: GameState) => 1 + 0.2 * rank(s, 'qualitaetskontrolle'),
  skillDuration: (s: GameState) => 1 + 0.2 * rank(s, 'meisterrezept'),
  skillCooldown: (s: GameState) => 1 - 0.1 * rank(s, 'meisterrezept'),
  price: (s: GameState) => 1 + 0.06 * rank(s, 'verkaufsstellen'),
  perCrownBonus: (s: GameState) => 0.01 * rank(s, 'markensiegel'),
  /** Floors 6–8 (index ≥ 5). */
  premium: (s: GameState, floor: number) => (floor >= 5 ? 1 + 0.3 * rank(s, 'premiumsortiment') : 1),
};

/* ------------------------------------------------------------------------- */
/* Points                                                                     */
/* ------------------------------------------------------------------------- */

export function addResearchPoints(s: GameState, n: number): void {
  if (n <= 0) return;
  s.research.points += n;
  s.research.earned += n;
}

export const POINTS = RESEARCH_POINTS;

/** Opens the lab for good once the 3rd floor stands. */
export function checkLabOpen(s: GameState): void {
  if (!s.research.open && s.floors[LAB_FLOOR]?.unlocked) s.research.open = true;
}

/* ------------------------------------------------------------------------- */
/* Running research                                                           */
/* ------------------------------------------------------------------------- */

export type NodeState = 'gesperrt' | 'verfuegbar' | 'aktiv' | 'abgeschlossen' | 'maximal';

export function nodeState(s: GameState, id: ResearchId): NodeState {
  const n = RESEARCH_BY_ID[id];
  const r = rank(s, id);
  if (s.research.active?.id === id) return 'aktiv';
  if (r >= n.maxRank) return 'maximal';
  if (n.requires && rank(s, n.requires.id) < n.requires.rank) return r > 0 ? 'abgeschlossen' : 'gesperrt';
  return r > 0 ? 'abgeschlossen' : 'verfuegbar';
}

/** Cost and duration of the next rank, or null at max rank. */
export function nextRank(s: GameState, id: ResearchId): { rank: number; cost: number; duration: number } | null {
  const n = RESEARCH_BY_ID[id];
  const r = rank(s, id);
  if (r >= n.maxRank) return null;
  return { rank: r + 1, cost: n.cost[r], duration: Math.round(n.duration[r] * R.researchTime(s)) };
}

export type StartBlock = 'max' | 'locked' | 'busy' | 'points' | 'closed' | null;

export function whyNot(s: GameState, id: ResearchId): StartBlock {
  if (!s.research.open) return 'closed';
  const n = RESEARCH_BY_ID[id];
  const next = nextRank(s, id);
  if (!next) return 'max';
  if (n.requires && rank(s, n.requires.id) < n.requires.rank) return 'locked';
  if (s.research.active) return 'busy';
  if (s.research.points < next.cost) return 'points';
  return null;
}

export function startResearch(s: GameState, id: ResearchId): boolean {
  if (whyNot(s, id) !== null) return false;
  const next = nextRank(s, id)!;
  s.research.points -= next.cost;
  s.research.active = { id, remaining: next.duration, total: next.duration };
  return true;
}

/** Advances the running research by `dt` seconds (live, offline and beyond the offline cap). */
export function advanceResearch(s: GameState, dt: number, ctx: SimContext | null): void {
  const a = s.research.active;
  if (!a) return;
  a.remaining -= dt;
  if (a.remaining <= 1e-9) {
    s.research.ranks[a.id] = rank(s, a.id) + 1;
    s.research.active = null;
    ctx?.events?.push({ type: 'researchDone', id: a.id, rank: s.research.ranks[a.id] });
    if (ctx?.report) ctx.report.researchDone.push(a.id);
  }
}
