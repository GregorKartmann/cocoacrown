import { BALANCE } from '../config/balance';
import { CATEGORY_BONUSES, FIRST_NAMES, LAST_NAMES } from '../config/content';
import { QUESTS } from '../config/quests';
import { D, Decimal, dmax } from '../core/num';
import {
  analyzeFlow,
  bulkUpgradeCost,
  costFactor,
  costParams,
  crownsAvailable,
  floorIndex,
  prestigeUnlocked,
  floorUnlockCost,
  liftStats,
  managerHireCost,
  maxAffordableLevels,
  floorStats,
  shipStats,
  stationLevel,
} from './formulas';
import { freshFloors, freshLift, freshShip } from './init';
import { scheduleGolden } from './sim';
import { nextRandom, randomInt, weightedPick } from './rng';
import type { BuyMode, GameState, Manager, ManagerCategory, SimContext, StationId } from './types';

/* ------------------------------------------------------------------------- */
/* Upgrades                                                                   */
/* ------------------------------------------------------------------------- */

export interface UpgradeQuote {
  levels: number;
  cost: Decimal;
  affordable: boolean;
  /** For MAX with nothing affordable: the next single level. */
  nextSingleCost: Decimal;
  atMax: boolean;
}

export function quoteUpgrade(s: GameState, station: StationId, mode: BuyMode): UpgradeQuote {
  const p = costParams(station);
  const level = stationLevel(s, station);
  const factor = costFactor(s, station);
  const remaining = Math.max(0, p.maxLevel - level);
  const nextSingleCost = bulkUpgradeCost(p, level, 1, factor);
  if (remaining === 0) return { levels: 0, cost: D(0), affordable: false, nextSingleCost, atMax: true };
  if (mode === 'max') {
    const n = maxAffordableLevels(p, level, s.money, factor);
    if (n === 0) return { levels: 1, cost: nextSingleCost, affordable: false, nextSingleCost, atMax: false };
    const cost = bulkUpgradeCost(p, level, n, factor);
    return { levels: n, cost, affordable: true, nextSingleCost, atMax: false };
  }
  const n = Math.min(mode, remaining);
  const cost = bulkUpgradeCost(p, level, n, factor);
  return { levels: n, cost, affordable: s.money.gte(cost), nextSingleCost, atMax: false };
}

export function buyUpgrade(s: GameState, station: StationId, mode: BuyMode): number {
  const q = quoteUpgrade(s, station, mode);
  if (!q.affordable || q.levels <= 0) return 0;
  s.money = s.money.sub(q.cost);
  if (s.money.lt(0)) s.money = D(0);
  if (station === 'lift') s.lift.level += q.levels;
  else if (station === 'ship') s.ship.level += q.levels;
  else s.floors[floorIndex(station)].level += q.levels;
  return q.levels;
}

export function unlockFloor(s: GameState, i: number): boolean {
  const f = s.floors[i];
  if (!f || f.unlocked) return false;
  if (i > 0 && !s.floors[i - 1].unlocked) return false;
  const cost = floorUnlockCost(i);
  if (s.money.lt(cost)) return false;
  s.money = s.money.sub(cost);
  f.unlocked = true;
  f.level = 1;
  // A manager who ran this floor before the last brand sale returns on their own.
  const station = `f${i}` as StationId;
  const back = s.managers.find((m) => m.home === station && !m.assignedTo);
  if (back) assignManager(s, back.id, station);
  for (const m of s.managers) if (m.home === station) m.home = null;
  if (i === s.floors.length - 1) noteFloor5(s);
  return true;
}

export function nextLockedFloor(s: GameState): number | null {
  const i = s.floors.findIndex((f) => !f.unlocked);
  return i === -1 ? null : i;
}

/* ------------------------------------------------------------------------- */
/* Managers                                                                   */
/* ------------------------------------------------------------------------- */

export function hireManager(s: GameState, category: ManagerCategory): Manager | null {
  const cost = managerHireCost(s, category);
  if (s.money.lt(cost)) return null;
  s.money = s.money.sub(cost);
  s.hires[category] += 1;
  const rarity = weightedPick(s, BALANCE.managers.rarities);
  const bonuses = CATEGORY_BONUSES[category];
  const bonus = bonuses[randomInt(s, bonuses.length)];
  const name = `${FIRST_NAMES[randomInt(s, FIRST_NAMES.length)]} ${LAST_NAMES[randomInt(s, LAST_NAMES.length)]}`;
  const m: Manager = {
    id: `m${s.nextManagerId++}`,
    name,
    category,
    rarity,
    bonus,
    look: { skin: randomInt(s, 5), hair: randomInt(s, 5), hairColor: randomInt(s, 6), accessory: randomInt(s, 5) },
    assignedTo: null,
    home: null,
    skillActive: 0,
    skillCooldown: 0,
  };
  s.managers.push(m);
  s.stats.managersHired += 1;
  return m;
}

export function categoryOf(station: StationId): ManagerCategory {
  return station === 'lift' ? 'lift' : station === 'ship' ? 'ship' : 'floor';
}

function setStationManager(s: GameState, station: StationId, id: string | null): void {
  if (station === 'lift') s.lift.managerId = id;
  else if (station === 'ship') s.ship.managerId = id;
  else s.floors[floorIndex(station)].managerId = id;
}

function stationManagerId(s: GameState, station: StationId): string | null {
  if (station === 'lift') return s.lift.managerId;
  if (station === 'ship') return s.ship.managerId;
  return s.floors[floorIndex(station)].managerId;
}

/** Assign (or with station=null: unassign). A manager can run one station; a station has one manager. */
export function assignManager(s: GameState, managerId: string, station: StationId | null): boolean {
  const m = s.managers.find((x) => x.id === managerId);
  if (!m) return false;
  if (station) {
    if (categoryOf(station) !== m.category) return false;
    if (station.startsWith('f') && !s.floors[floorIndex(station)].unlocked) return false;
  }
  if (m.assignedTo) setStationManager(s, m.assignedTo, null);
  if (station) {
    const prev = stationManagerId(s, station);
    if (prev) {
      const pm = s.managers.find((x) => x.id === prev);
      if (pm) pm.assignedTo = null;
    }
    setStationManager(s, station, m.id);
  }
  m.assignedTo = station;
  if (station) m.home = null;
  return true;
}

export function activateSkill(s: GameState, managerId: string): boolean {
  const m = s.managers.find((x) => x.id === managerId);
  if (!m || !m.assignedTo || m.skillCooldown > 0 || m.skillActive > 0) return false;
  const r = BALANCE.managers.rarities[m.rarity];
  m.skillActive = r.duration;
  m.skillCooldown = BALANCE.managers.skillCooldown;
  s.stats.skillsUsed += 1;
  return true;
}

/* ------------------------------------------------------------------------- */
/* Taps                                                                       */
/* ------------------------------------------------------------------------- */

export type TapResult = 'started' | 'boosted' | 'limited' | 'nothing';

const HEADLESS: SimContext = { events: null, offline: false };

/** Queues tap time for smooth payout (see step()); returns the new queue. */
function queueRush(current: number, cycle: number): number {
  return Math.min(current + cycle * BALANCE.tap.boost, cycle * BALANCE.tap.maxQueue);
}

/**
 * A tap starts an idle station (manual mode) or earns a running one
 * BALANCE.tap.boost of a cycle, paid out smoothly as extra speed so lift, vans
 * and machines never jump. A token bucket caps the useful rate.
 */
export function tapStation(s: GameState, station: StationId, _ctx: SimContext = HEADLESS): TapResult {
  s.stats.taps += 1;
  if (station === 'lift') {
    const L = s.lift;
    if (L.phase === 'idle') {
      L.request = true;
      return 'started';
    }
    if (L.tapBudget < 1) return 'limited';
    L.tapBudget -= 1;
    L.rush = queueRush(L.rush, liftStats(s).tripTime);
    return 'boosted';
  }
  if (station === 'ship') {
    const S = s.ship;
    if (S.vans.some((v) => v.phase === 'dock') && S.depot.gt(0)) {
      S.request = true;
      return 'started';
    }
    if (S.tapBudget < 1) return 'limited';
    const moving = S.vans.filter((v) => v.phase !== 'dock');
    if (!moving.length) return 'nothing';
    S.tapBudget -= 1;
    S.rush = queueRush(S.rush, shipStats(s).roundTrip);
    return 'boosted';
  }
  const i = floorIndex(station);
  const f = s.floors[i];
  if (!f.unlocked) return 'nothing';
  if (!f.running) {
    f.running = true;
    f.progress = 0;
    return 'started';
  }
  if (f.stalled) return 'nothing';
  if (f.tapBudget < 1) return 'limited';
  f.tapBudget -= 1;
  f.rush = queueRush(f.rush, floorStats(s, i).cycle);
  return 'boosted';
}

/* ------------------------------------------------------------------------- */
/* Prestige: "Marke verkaufen"                                                */
/* ------------------------------------------------------------------------- */

/**
 * Sells the brand: crowns for lifetime earnings, then a fresh manufactory.
 * Resets money, floors, levels, logistics and running boni. Keeps crowns,
 * managers (and their hire count), quests, statistics and settings. Managers
 * of floors 2–5 remember their floor and return when it is rebuilt.
 * Returns the crowns gained (0 = nothing happened).
 */
export function sellBrand(s: GameState): number {
  const gained = crownsAvailable(s);
  if (gained < 1 || !prestigeUnlocked(s)) return 0;
  s.prestige.crowns += gained;
  s.prestige.runs += 1;
  s.prestige.runStartEarned = s.stats.totalEarned;
  s.prestige.runStartPlay = s.stats.playSeconds;

  const keep: StationId[] = ['f0', 'lift', 'ship'];
  for (const m of s.managers) {
    if (m.assignedTo && !keep.includes(m.assignedTo)) {
      m.home = m.assignedTo;
      m.assignedTo = null;
    }
    m.skillActive = 0;
    m.skillCooldown = 0;
  }
  s.money = D(BALANCE.startMoney);
  s.floors = freshFloors();
  s.lift = freshLift();
  s.ship = freshShip();
  for (const m of s.managers) if (m.assignedTo) setStationManager(s, m.assignedTo, m.id);
  s.boosts = [];
  s.golden = { nextIn: BALANCE.golden.firstSpawn, active: null };
  return gained;
}

/** Remembers the fastest way to the 5th floor (shown in the brand-sale dialog). */
export function noteFloor5(s: GameState): void {
  const t = s.stats.playSeconds - s.prestige.runStartPlay;
  if (s.prestige.bestFloor5 === null || t < s.prestige.bestFloor5) s.prestige.bestFloor5 = t;
}

/* ------------------------------------------------------------------------- */
/* Golden cocoa bean                                                          */
/* ------------------------------------------------------------------------- */

export type GoldenReward = { kind: 'cash'; amount: Decimal } | { kind: 'rush' | 'express'; factor: number; duration: number };

export function catchGolden(s: GameState): GoldenReward | null {
  if (!s.golden.active) return null;
  s.golden.active = null;
  scheduleGolden(s);
  s.stats.goldenCaught += 1;
  const idx = weightedPick(s, BALANCE.golden.rewards);
  const r = BALANCE.golden.rewards[idx];
  if (r.id === 'cash') {
    const cfg = r as { seconds: number; minimum: number };
    const amount = dmax(analyzeFlow(s).income.mul(cfg.seconds), D(cfg.minimum));
    s.money = s.money.add(amount);
    s.stats.totalEarned = s.stats.totalEarned.add(amount);
    return { kind: 'cash', amount };
  }
  const cfg = r as { factor: number; duration: number };
  const kind = r.id === 'rush' ? 'rush' : 'express';
  const existing = s.boosts.find((b) => b.kind === kind);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, cfg.duration);
    existing.total = Math.max(existing.total, cfg.duration);
  } else s.boosts.push({ kind, factor: cfg.factor, remaining: cfg.duration, total: cfg.duration });
  return { kind, factor: cfg.factor, duration: cfg.duration };
}

/* ------------------------------------------------------------------------- */
/* Quests                                                                     */
/* ------------------------------------------------------------------------- */

export function currentQuest(s: GameState) {
  if (s.quest.index >= QUESTS.length) return null;
  const q = QUESTS[s.quest.index];
  const progress = Math.min(q.target, q.progress(s));
  return { def: q, progress, done: progress >= q.target };
}

export function claimQuest(s: GameState): number {
  const q = currentQuest(s);
  if (!q || !q.done) return 0;
  s.money = s.money.add(q.def.reward);
  s.stats.totalEarned = s.stats.totalEarned.add(q.def.reward);
  s.quest.index += 1;
  return q.def.reward;
}

/** Used by tests to make sure randomness is consumed deterministically. */
export function peekRandom(s: GameState): number {
  const copy = { rng: s.rng };
  return nextRandom(copy);
}
