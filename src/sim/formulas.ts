import { BALANCE, type FloorDef, type Milestone, type LogisticsMilestone } from '../config/balance';
import { D, Decimal } from '../core/num';
import { R } from './research';
import type { GameState, Manager, ManagerBonus, StationId } from './types';

/* ------------------------------------------------------------------------- */
/* Milestones                                                                 */
/* ------------------------------------------------------------------------- */

export function floorMilestoneFactors(level: number): { yield: number; speed: number; workers: number; tier: number } {
  let y = 1;
  let s = 1;
  let workers = 1;
  let tier = 1;
  for (const m of BALANCE.floorMilestones as readonly Milestone[]) {
    if (level < m.level) break;
    if (m.effect === 'yield') y *= m.factor;
    else s *= m.factor;
    if (m.worker) workers += 1;
    if (m.tier) tier += 1;
  }
  return { yield: y, speed: s, workers, tier };
}

export function logisticsMilestoneFactors(
  level: number,
  list: readonly LogisticsMilestone[],
): { capacity: number; speed: number; vehicles: number; tier: number } {
  let c = 1;
  let s = 1;
  let v = 1;
  let tier = 1;
  for (const m of list) {
    if (level < m.level) break;
    if (m.capacity) c *= m.capacity;
    if (m.speed) s *= m.speed;
    if (m.vehicle) v += 1;
    if (m.tier) tier += 1;
  }
  return { capacity: c, speed: s, vehicles: v, tier };
}

export function nextFloorMilestone(level: number): Milestone | null {
  for (const m of BALANCE.floorMilestones as readonly Milestone[]) if (m.level > level) return m;
  return null;
}

export function nextLogisticsMilestone(level: number, list: readonly LogisticsMilestone[]): LogisticsMilestone | null {
  for (const m of list) if (m.level > level) return m;
  return null;
}

export function previousMilestoneLevel(level: number, levels: readonly { level: number }[]): number {
  let prev = 0;
  for (const m of levels) {
    if (m.level <= level) prev = m.level;
    else break;
  }
  return prev;
}

/* ------------------------------------------------------------------------- */
/* Managers                                                                   */
/* ------------------------------------------------------------------------- */

export function managerOf(s: GameState, station: StationId): Manager | null {
  const id = station === 'lift' ? s.lift.managerId : station === 'ship' ? s.ship.managerId : s.floors[floorIndex(station)].managerId;
  if (!id) return null;
  return s.managers.find((m) => m.id === id) ?? null;
}

/** Multiplier contributed by a manager (passive + active skill) for one bonus type. */
export function managerFactor(m: Manager | null, bonus: ManagerBonus, permanentOnly = false): number {
  if (!m || m.bonus !== bonus) return 1;
  const r = BALANCE.managers.rarities[m.rarity];
  if (bonus === 'cost') {
    let f = 1 - r.costCut;
    if (!permanentOnly && m.skillActive > 0) f *= BALANCE.managers.costSkillFactor;
    return f;
  }
  let f = 1 + r.passive;
  if (!permanentOnly && m.skillActive > 0) f *= r.active;
  return f;
}

export function boostFactor(s: GameState, kind: 'rush' | 'express'): number {
  let f = 1;
  for (const b of s.boosts) if (b.kind === kind && b.remaining > 0) f *= b.factor;
  return f;
}

/* ------------------------------------------------------------------------- */
/* Floors                                                                     */
/* ------------------------------------------------------------------------- */

export const FLOOR_IDS = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9'] as const;
/** The 5th floor gates the brand sale (prestige) and is the pacing reference. */
export const PRESTIGE_FLOOR = 4;

export function floorIndex(id: StationId): number {
  return Number(id.slice(1));
}

export function floorId(i: number): StationId {
  return FLOOR_IDS[i];
}

export interface FloorStats {
  level: number;
  cycle: number;
  unitsPerCycle: Decimal;
  batch: Decimal;
  rate: Decimal;
  bufferCap: Decimal;
  workers: number;
  tier: number;
  speedFactor: number;
  yieldFactor: number;
}

export function floorStatsAt(s: GameState, i: number, level: number, permanentOnly = false): FloorStats {
  const def = BALANCE.floors[i];
  const ms = floorMilestoneFactors(level);
  const m = managerOf(s, floorId(i));
  const speed = ms.speed * managerFactor(m, 'speed', permanentOnly) * R.floorSpeed(s) * (permanentOnly ? 1 : boostFactor(s, 'rush'));
  let yieldF = ms.yield * managerFactor(m, 'yield', permanentOnly) * R.floorYield(s);
  let cycle = def.baseCycle / speed;
  if (cycle < BALANCE.floor.minCycle) {
    // Faster than the machine can run visually: convert the surplus into yield.
    yieldF *= BALANCE.floor.minCycle / cycle;
    cycle = BALANCE.floor.minCycle;
  }
  const unitsPerCycle = D(def.baseUnits).mul(level).mul(yieldF);
  const batch = unitsPerCycle.mul(def.unitValue).mul(R.premium(s, i));
  const rate = batch.div(cycle);
  // Storage is sized from permanent values only so temporary boosts never shrink it later.
  let bufferCap: Decimal;
  if (permanentOnly) bufferCap = batch.mul(BALANCE.floor.bufferBatches).mul(R.buffer(s));
  else bufferCap = floorStatsAt(s, i, level, true).bufferCap;
  return { level, cycle, unitsPerCycle, batch, rate, bufferCap, workers: ms.workers, tier: ms.tier, speedFactor: speed, yieldFactor: yieldF };
}

export function floorStats(s: GameState, i: number): FloorStats {
  return floorStatsAt(s, i, s.floors[i].level);
}

export function unlockedFloorCount(s: GameState): number {
  let n = 0;
  for (const f of s.floors) if (f.unlocked) n++;
  return n;
}

/** Capacity multiplier for lift and vans from the floors 6–8 that stand (bigger cabin, bigger vans). */
export function oberhausFactor(s: GameState): number {
  let f = 1;
  for (let i = 0; i < s.floors.length; i++) {
    const boost = (BALANCE.floors[i] as { logistics?: number }).logistics;
    if (boost && s.floors[i].unlocked) f *= boost;
  }
  return f;
}

/* ------------------------------------------------------------------------- */
/* Lift                                                                       */
/* ------------------------------------------------------------------------- */

export interface LiftStats {
  level: number;
  capacity: Decimal;
  floorTime: number;
  dwell: number;
  unload: number;
  tripTime: number;
  rate: Decimal;
  depotCap: Decimal;
  tier: number;
  speedFactor: number;
}

export function liftStatsAt(s: GameState, level: number): LiftStats {
  const cfg = BALANCE.lift;
  const ms = logisticsMilestoneFactors(level, cfg.milestones);
  const m = managerOf(s, 'lift');
  const speed = ms.speed * managerFactor(m, 'speed') * R.logisticsSpeed(s) * boostFactor(s, 'express');
  const oh = oberhausFactor(s);
  const capacity = D(cfg.baseCapacity).mul(level).mul(ms.capacity).mul(managerFactor(m, 'capacity')).mul(oh);
  const permanentCap = D(cfg.baseCapacity).mul(level).mul(ms.capacity).mul(managerFactor(m, 'capacity', true)).mul(oh);
  const floorTime = cfg.floorTravel / speed;
  const dwell = cfg.dwell / speed;
  const unload = cfg.unload / speed;
  const top = Math.max(1, unlockedFloorCount(s));
  const tripTime = 2 * top * floorTime + top * dwell + unload;
  return {
    level,
    capacity,
    floorTime,
    dwell,
    unload,
    tripTime,
    rate: capacity.div(tripTime),
    depotCap: permanentCap.mul(cfg.depotLoads),
    tier: ms.tier,
    speedFactor: speed,
  };
}

export function liftStats(s: GameState): LiftStats {
  return liftStatsAt(s, s.lift.level);
}

/* ------------------------------------------------------------------------- */
/* Shipping                                                                   */
/* ------------------------------------------------------------------------- */

export interface ShipStats {
  level: number;
  vans: number;
  capacity: Decimal;
  perVan: Decimal;
  roundTrip: number;
  dispatchInterval: number;
  priceFactor: number;
  rate: Decimal;
  speedFactor: number;
}

export function shipStatsAt(s: GameState, level: number): ShipStats {
  const cfg = BALANCE.shipping;
  const ms = logisticsMilestoneFactors(level, cfg.milestones);
  const m = managerOf(s, 'ship');
  const speed = ms.speed * managerFactor(m, 'speed') * R.logisticsSpeed(s) * boostFactor(s, 'express');
  const vans = Math.min(cfg.maxVans, ms.vehicles);
  const capacity = D(cfg.baseCapacity).mul(level).mul(ms.capacity).mul(managerFactor(m, 'capacity')).mul(R.shipCapacity(s)).mul(oberhausFactor(s));
  const roundTrip = cfg.roundTrip / speed;
  return {
    level,
    vans,
    capacity,
    perVan: capacity.div(vans),
    roundTrip,
    dispatchInterval: roundTrip / vans,
    priceFactor: managerFactor(m, 'price') * crownFactor(s) * R.price(s),
    rate: capacity.div(roundTrip),
    speedFactor: speed,
  };
}

export function shipStats(s: GameState): ShipStats {
  return shipStatsAt(s, s.ship.level);
}

/* ------------------------------------------------------------------------- */
/* Prestige: crowns                                                           */
/* ------------------------------------------------------------------------- */

/** Permanent income multiplier from crowns (applied to the sale price). */
export function perCrown(s: GameState): number {
  return BALANCE.prestige.perCrown + R.perCrownBonus(s);
}

/** Crowns as they count for the income bonus: in full up to 100, then with the square root. */
export function bonusCrowns(crowns: number): number {
  const t = BALANCE.prestige.fullBonusUpTo;
  return crowns <= t ? crowns : t * Math.sqrt(crowns / t);
}

export function crownFactor(s: GameState): number {
  return 1 + perCrown(s) * bonusCrowns(s.prestige.crowns);
}

export function crownFactorFor(crowns: number, s?: GameState): number {
  return 1 + (s ? perCrown(s) : BALANCE.prestige.perCrown) * bonusCrowns(crowns);
}

/** Crowns still missing before floor i can be built (0 = none needed). */
export function crownsMissingFor(s: GameState, i: number): number {
  const need = (BALANCE.floors[i] as FloorDef | undefined)?.crowns ?? 0;
  return Math.max(0, need - s.prestige.crowns);
}

/**
 * Crowns earned in total so far by lifetime earnings (owned + claimable):
 * ⌊√(L / divisor)⌋ up to `tailFrom` crowns, then ⌊tailFrom · (L / L_tail)^(1/tailRoot)⌋
 * (continuous at L_tail = tailFrom² · divisor), so late crowns need more earnings.
 */
export function crownsByEarnings(lifetime: Decimal): number {
  if (lifetime.lte(0)) return 0;
  const { divisor, tailFrom, tailRoot } = BALANCE.prestige;
  const x = lifetime.div(divisor);
  if (x.lte(tailFrom * tailFrom)) return Math.floor(x.sqrt().toNumber() + 1e-9);
  return Math.floor(tailFrom * x.div(tailFrom * tailFrom).pow(1 / tailRoot).toNumber() + 1e-9);
}

/** Lifetime earnings at which crown number k is reached (inverse of crownsByEarnings). */
export function earningsForCrowns(k: number): Decimal {
  const { divisor, tailFrom, tailRoot } = BALANCE.prestige;
  if (k <= tailFrom) return D(divisor).mul(k).mul(k);
  return D(divisor)
    .mul(tailFrom * tailFrom)
    .mul(D(k / tailFrom).pow(tailRoot));
}

/** Number of milestone levels in (before, after] for a station – each is worth a Rezeptpunkt. */
export function milestonesCrossed(station: StationId, before: number, after: number): number {
  const list: readonly { level: number }[] = station === 'lift' ? BALANCE.lift.milestones : station === 'ship' ? BALANCE.shipping.milestones : BALANCE.floorMilestones;
  let n = 0;
  for (const m of list) if (m.level > before && m.level <= after) n++;
  return n;
}

/** The brand can be sold once the 5th floor was built at least once. */
export function prestigeUnlocked(s: GameState): boolean {
  // the 5th floor (index PRESTIGE_FLOOR) has to have been built once
  return s.prestige.runs > 0 || s.prestige.bestFloor5 !== null;
}

/**
 * Crowns a brand sale would give right now: how far the earnings since the
 * last sale moved along the crown curve. Measured from the last sale's
 * lifetime earnings (not from the crowns owned), so a change of the curve –
 * like the steeper tail in 0.8.0 – never strands crowns that were earned
 * under the old one.
 */
export function crownsAvailable(s: GameState): number {
  return Math.max(0, crownsByEarnings(s.stats.totalEarned) - crownsByEarnings(s.prestige.runStartEarned));
}

/** Lifetime earnings at which the next claimable crown appears. */
export function nextCrownAt(s: GameState): Decimal {
  return earningsForCrowns(crownsByEarnings(s.stats.totalEarned) + 1);
}

/** Lifetime earnings at which the current crown step started (for progress bars). */
export function crownStepStart(s: GameState): Decimal {
  return earningsForCrowns(crownsByEarnings(s.stats.totalEarned));
}

/* ------------------------------------------------------------------------- */
/* Flow analysis (bottleneck)                                                 */
/* ------------------------------------------------------------------------- */

export type Stage = 'production' | 'lift' | 'ship';

export interface FlowAnalysis {
  production: Decimal;
  lift: Decimal;
  ship: Decimal;
  bottleneck: Stage;
  /** Theoretical income per second when everything runs automatically. */
  income: Decimal;
  priceFactor: number;
}

export function analyzeFlow(s: GameState): FlowAnalysis {
  let production = D(0);
  for (let i = 0; i < s.floors.length; i++) if (s.floors[i].unlocked) production = production.add(floorStats(s, i).rate);
  const lift = liftStats(s).rate;
  const sh = shipStats(s);
  let bottleneck: Stage = 'production';
  let min = production;
  if (lift.lt(min)) {
    min = lift;
    bottleneck = 'lift';
  }
  if (sh.rate.lt(min)) {
    min = sh.rate;
    bottleneck = 'ship';
  }
  return { production, lift, ship: sh.rate, bottleneck, income: min.mul(sh.priceFactor), priceFactor: sh.priceFactor };
}

/* ------------------------------------------------------------------------- */
/* Costs                                                                      */
/* ------------------------------------------------------------------------- */

export interface CostParams {
  baseCost: number;
  growth: number;
  maxLevel: number;
}

export function costParams(station: StationId): CostParams {
  if (station === 'lift') return { baseCost: BALANCE.lift.baseCost, growth: BALANCE.lift.costGrowth, maxLevel: BALANCE.lift.maxLevel };
  if (station === 'ship') return { baseCost: BALANCE.shipping.baseCost, growth: BALANCE.shipping.costGrowth, maxLevel: BALANCE.shipping.maxLevel };
  const def = BALANCE.floors[floorIndex(station)];
  return { baseCost: def.baseCost, growth: def.costGrowth, maxLevel: BALANCE.floor.maxLevel };
}

export function stationLevel(s: GameState, station: StationId): number {
  if (station === 'lift') return s.lift.level;
  if (station === 'ship') return s.ship.level;
  return s.floors[floorIndex(station)].level;
}

/** Multiplier on upgrade prices (manager "Sparfuchs" and its skill). */
export function costFactor(s: GameState, station: StationId): number {
  const research = station.startsWith('f') ? R.floorCost(s) : 1;
  return managerFactor(managerOf(s, station), 'cost') * research;
}

/** Price of the single upgrade from `level` to `level + 1`. */
export function singleUpgradeCost(p: CostParams, level: number, factor: number): Decimal {
  return D(p.growth).pow(level - 1).mul(p.baseCost).mul(factor);
}

/**
 * Price of `count` consecutive upgrades starting at `level`.
 * Defined as the exact sum of the single prices so a bulk purchase always
 * costs the same as buying the levels one by one.
 */
export function bulkUpgradeCost(p: CostParams, level: number, count: number, factor: number): Decimal {
  let total = D(0);
  for (let k = 0; k < count; k++) total = total.add(singleUpgradeCost(p, level + k, factor));
  return total;
}

/** Closed form of the geometric series, used to estimate MAX quickly and in tests. */
export function geometricUpgradeCost(p: CostParams, level: number, count: number, factor: number): Decimal {
  const g = D(p.growth);
  return g.pow(level - 1).mul(p.baseCost).mul(factor).mul(g.pow(count).sub(1)).div(g.sub(1));
}

/** Largest number of levels affordable with `money` (bounded by maxLevel and `cap`). */
export function maxAffordableLevels(p: CostParams, level: number, money: Decimal, factor: number, cap = 1000): number {
  const remainingLevels = Math.max(0, Math.min(cap, p.maxLevel - level));
  if (remainingLevels === 0) return 0;
  const first = singleUpgradeCost(p, level, factor);
  if (money.lt(first)) return 0;
  // Estimate via inverse geometric series, then correct with exact sums.
  const g = p.growth;
  const ratioLog = money.mul(g - 1).div(first).add(1).log10();
  let n = Math.floor(ratioLog / Math.log10(g));
  n = Math.max(1, Math.min(remainingLevels, n));
  while (n > 1 && bulkUpgradeCost(p, level, n, factor).gt(money)) n--;
  while (n < remainingLevels && bulkUpgradeCost(p, level, n + 1, factor).lte(money)) n++;
  return n;
}

export function managerHireCost(s: GameState, category: 'floor' | 'lift' | 'ship'): Decimal {
  const base = BALANCE.managers.hireBaseCost[category];
  const growth = BALANCE.managers.hireCostGrowth[category];
  return D(growth).pow(s.hires[category]).mul(base);
}

export function floorUnlockCost(i: number): Decimal {
  return D(BALANCE.floors[i].unlockCost);
}
