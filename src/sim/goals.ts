/**
 * Erfolge, Tagesziele, Serie und Belohnungen.
 *
 * Achievements are derived from lifetime counters (no own progress state),
 * only the claimed ones are stored. Daily goals use the calendar day in the
 * time zone saved at the first start and count active play only: GameStore
 * feeds them from live simulation events and player actions, never from the
 * offline catch-up.
 */
import { ACHIEVEMENTS, DAILY_BY_ID, DAILY_POOL, DAILY_REWARD, DAILY_SLOTS, STREAK, type Achievement, type DailyMetric, type DailyTemplate, type GoalReward } from '../config/goals';
import { D, dmax, type Decimal } from '../core/num';
import { addResearchPoints } from './research';
import { analyzeFlow, bulkUpgradeCost, costFactor, costParams, managerHireCost, stationLevel } from './formulas';
import type { DailyState, GameState, StationId } from './types';

/* ------------------------------------------------------------------------- */
/* Calendar                                                                    */
/* ------------------------------------------------------------------------- */

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function parts(now: number, tz: string): { y: number; m: number; d: number; h: number; min: number; sec: number } {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const p: Record<string, number> = {};
    for (const x of f.formatToParts(new Date(now))) if (x.type !== 'literal') p[x.type] = Number(x.value);
    return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, min: p.minute, sec: p.second };
  } catch {
    const t = new Date(now);
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), h: t.getHours(), min: t.getMinutes(), sec: t.getSeconds() };
  }
}

/** Calendar day YYYY-MM-DD at `now` in `tz`. */
export function dayKey(now: number, tz: string): string {
  const p = parts(now, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Whole days from day key a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  return dayNumber(b) - dayNumber(a);
}

/** Seconds until the next local midnight in `tz`. */
export function secondsToMidnight(now: number, tz: string): number {
  const p = parts(now, tz);
  return Math.max(1, 86400 - (p.h * 3600 + p.min * 60 + p.sec));
}

/* ------------------------------------------------------------------------- */
/* Rewards                                                                     */
/* ------------------------------------------------------------------------- */

export function grantReward(s: GameState, r: GoalReward): void {
  if (r.kind === 'recipePoints') addResearchPoints(s, r.amount); // kept until the lab opens
  else if (r.kind === 'managerHireCredit') s.rewards.freeHires += r.amount;
  else s.rewards.goldenBeans += r.amount;
}

export function rewardText(r: GoalReward): string {
  if (r.kind === 'recipePoints') return `${r.amount} ${r.amount === 1 ? 'Rezeptpunkt' : 'Rezeptpunkte'}`;
  if (r.kind === 'managerHireCredit') return r.amount === 1 ? 'Manager kostenlos' : `${r.amount} Manager kostenlos`;
  return r.amount === 1 ? 'Goldene Bohne' : `${r.amount} Goldene Bohnen`;
}

/* ------------------------------------------------------------------------- */
/* Achievements                                                                */
/* ------------------------------------------------------------------------- */

export function achievementProgress(s: GameState, a: Achievement): number {
  return Math.min(a.target, a.value(s));
}

export function achievementReached(s: GameState, a: Achievement): boolean {
  return a.value(s) >= a.target;
}

export function isClaimed(s: GameState, id: string): boolean {
  return s.goals.claimed.includes(id);
}

/** Reached but not yet claimed. */
export function claimableAchievements(s: GameState): Achievement[] {
  return ACHIEVEMENTS.filter((a) => achievementReached(s, a) && !isClaimed(s, a.id));
}

export function claimAchievement(s: GameState, id: string): GoalReward | null {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || isClaimed(s, id) || !achievementReached(s, a)) return null;
  s.goals.claimed.push(id);
  grantReward(s, a.reward);
  return a.reward;
}

/** Lifetime records the achievements read; called after level purchases and floor builds. */
export function updateRecords(s: GameState): void {
  let lv = s.stats.maxFloorLevel;
  let fl = s.stats.maxFloors;
  let count = 0;
  for (const f of s.floors) {
    if (!f.unlocked) continue;
    count++;
    if (f.level > lv) lv = f.level;
  }
  s.stats.maxFloorLevel = lv;
  s.stats.maxFloors = Math.max(fl, count);
}

/* ------------------------------------------------------------------------- */
/* Daily goals                                                                 */
/* ------------------------------------------------------------------------- */

export function defaultDaily(tz = localTimeZone()): DailyState {
  return { tz, day: '', goals: [], prevIds: [], floorsDone: [], stationsTapped: [], streak: 0, lastCompleteDay: '', streakHireGiven: false };
}

/** Small deterministic hash (FNV-1a) for picking the day's goals. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function nextCost(s: GameState, station: StationId): Decimal {
  return bulkUpgradeCost(costParams(station), stationLevel(s, station), 1, costFactor(s, station));
}

function soon(s: GameState, cost: Decimal): boolean {
  // affordable now or within five minutes of current income
  return s.money.add(analyzeFlow(s).income.mul(300)).gte(cost);
}

export function eligible(s: GameState, t: DailyTemplate): boolean {
  for (const r of t.requires) {
    const unlocked = s.floors.map((f, i) => ({ f, i })).filter((x) => x.f.unlocked);
    if (r === 'manual_production_possible' && !unlocked.some((x) => !x.f.managerId)) return false;
    if (r === 'two_floors_unlocked' && unlocked.length < 2) return false;
    if (r === 'assigned_manager_present' && !s.managers.some((m) => m.assignedTo)) return false;
    if (r === 'affordable_production_upgrade_possible') {
      const cheapest = unlocked.map((x) => nextCost(s, `f${x.i}` as StationId)).reduce((a, b) => (b.lt(a) ? b : a));
      if (!soon(s, cheapest)) return false;
    }
    if (r === 'affordable_logistics_upgrade_possible') {
      const a = nextCost(s, 'lift');
      const b = nextCost(s, 'ship');
      if (!soon(s, a.lt(b) ? a : b)) return false;
    }
  }
  return true;
}

function targetFor(s: GameState, t: DailyTemplate): number {
  if (t.target !== 'income600') return t.target;
  // ten minutes of the current income, rounded to two significant digits
  const raw = dmax(analyzeFlow(s).income.mul(600), D(50)).toNumber();
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1));
  return Math.ceil(raw / p) * p;
}

/**
 * Makes sure today's offer exists: on a new calendar day three goals are drawn,
 * one per slot, from the eligible templates, avoiding yesterday's when possible.
 * Returns true when a new offer was created.
 */
export function refreshDaily(s: GameState, now: number, seed = s.rng): boolean {
  const d = s.daily;
  const today = dayKey(now, d.tz);
  if (d.day === today) return false;
  const prev = d.goals.map((g) => g.id);
  const goals = [];
  for (const slot of DAILY_SLOTS) {
    const all = DAILY_POOL.filter((t) => t.slot === slot);
    let pool = all.filter((t) => eligible(s, t));
    if (pool.length === 0) pool = all.filter((t) => t.requires.length === 0);
    const fresh = pool.filter((t) => !prev.includes(t.id));
    if (fresh.length > 0) pool = fresh;
    const pick = pool[hash(`${today}|${slot}|${seed}`) % pool.length];
    goals.push({ id: pick.id, target: targetFor(s, pick), progress: 0, claimed: false });
  }
  d.prevIds = prev;
  d.day = today;
  d.goals = goals;
  d.floorsDone = [];
  d.stationsTapped = [];
  return true;
}

export interface DailyBump {
  /** Goals that became complete with this bump. */
  completed: string[];
  /** All three done for the first time today: streak advanced. */
  dayDone: boolean;
  /** Streak rewards granted. */
  streakRewards: GoalReward[];
}

const NO_BUMP: DailyBump = { completed: [], dayDone: false, streakRewards: [] };

function allDone(d: DailyState): boolean {
  return d.goals.length === 3 && d.goals.every((g) => g.progress >= g.target);
}

/** Adds active-play progress; `key` makes "distinct" metrics count each floor/station once. */
export function bumpDaily(s: GameState, metric: DailyMetric, amount: number, key?: string | number): DailyBump {
  const d = s.daily;
  if (!d.goals.length) return NO_BUMP;
  if (metric === 'distinctActiveBatchFloors') {
    if (d.floorsDone.includes(key as number)) return NO_BUMP;
    d.floorsDone.push(key as number);
    amount = 1;
  } else if (metric === 'distinctManualStations') {
    if (d.stationsTapped.includes(String(key))) return NO_BUMP;
    d.stationsTapped.push(String(key));
    amount = 1;
  }
  const wasAll = allDone(d);
  const completed: string[] = [];
  for (const g of d.goals) {
    if (DAILY_BY_ID[g.id]?.metric !== metric || g.progress >= g.target) continue;
    g.progress = Math.min(g.target, g.progress + amount);
    if (g.progress >= g.target) completed.push(g.id);
  }
  if (!completed.length) return NO_BUMP;
  const out: DailyBump = { completed, dayDone: false, streakRewards: [] };
  if (!wasAll && allDone(d)) {
    out.dayDone = true;
    out.streakRewards = advanceStreak(s);
  }
  return out;
}

/** Streak bookkeeping when all three goals of the day are done. */
function advanceStreak(s: GameState): GoalReward[] {
  const d = s.daily;
  if (d.lastCompleteDay === d.day) return [];
  if (daysBetween(d.lastCompleteDay, d.day) === 1) d.streak += 1;
  else {
    d.streak = 1;
    d.streakHireGiven = false;
  }
  d.lastCompleteDay = d.day;
  const rewards: GoalReward[] = [];
  if (d.streak >= STREAK.hireAt && !d.streakHireGiven) {
    d.streakHireGiven = true;
    rewards.push({ kind: 'managerHireCredit', amount: 1 });
  }
  if (d.streak % STREAK.beanEvery === 0) rewards.push({ kind: 'goldenBean', amount: 1 });
  for (const r of rewards) grantReward(s, r);
  return rewards;
}

/** Current streak as the player sees it: a missed day breaks it. */
export function visibleStreak(s: GameState, now: number): number {
  const d = s.daily;
  const gap = daysBetween(d.lastCompleteDay, dayKey(now, d.tz));
  return gap <= 1 ? d.streak : 0;
}

export function claimDaily(s: GameState, index: number): GoalReward | null {
  const g = s.daily.goals[index];
  if (!g || g.claimed || g.progress < g.target) return null;
  g.claimed = true;
  grantReward(s, DAILY_REWARD);
  return DAILY_REWARD;
}

export function claimableDaily(s: GameState): number {
  return s.daily.goals.filter((g) => !g.claimed && g.progress >= g.target).length;
}

/* ------------------------------------------------------------------------- */
/* Free hire and redeemable golden bean                                       */
/* ------------------------------------------------------------------------- */

/** Hire cost shown in the UI: 0 while a free hire is waiting. */
export function effectiveHireCost(s: GameState, category: Parameters<typeof managerHireCost>[1]) {
  return s.rewards.freeHires > 0 ? D(0) : managerHireCost(s, category);
}
