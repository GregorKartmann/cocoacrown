/**
 * Lieferverträge (contract board). Offers are written from the factory's
 * current flow; progress is counted inside the simulation step (units a floor
 * finishes, or goods value the vans sell), so it also runs during offline
 * catch-up. Only one contract runs at a time.
 */
import { CONTRACTS, CUSTOMERS, CUSTOMER_BY_ID, type CustomerDef } from '../config/contracts';
import { D, Decimal } from '../core/num';
import { analyzeFlow, floorStatsAt } from './formulas';
import { grantReward } from './goals';
import { nextRandom } from './rng';
import type { ActiveContract, ContractOffer, ContractsState, GameState, SimContext } from './types';

export function defaultContracts(): ContractsState {
  return {
    open: false,
    ruf: 0,
    offers: Array.from({ length: CONTRACTS.slots }, () => null),
    slotAt: Array.from({ length: CONTRACTS.slots }, () => 0),
    active: null,
    nextId: 1,
    delivered: 0,
    failed: 0,
  };
}

/** Opens the board once the 2nd floor stands (stays open after brand sales). */
export function checkContractsOpen(s: GameState): boolean {
  const c = s.contracts;
  if (c.open || !s.floors[CONTRACTS.openFloor]?.unlocked) return false;
  c.open = true;
  c.slotAt = c.slotAt.map(() => s.simTime);
  return true;
}

/* ------------------------------------------------------------------------- */
/* Customers and Ruf                                                           */
/* ------------------------------------------------------------------------- */

export function customerUnlocked(s: GameState, c: CustomerDef): boolean {
  return s.contracts.ruf >= c.ruf;
}

/** Next customer still waiting for more Ruf (null when all write offers). */
export function nextCustomer(s: GameState): CustomerDef | null {
  return CUSTOMERS.find((c) => !customerUnlocked(s, c)) ?? null;
}

/** Ruf range of the current tier (for the progress bar). */
export function rufStep(s: GameState): { from: number; to: number | null } {
  const next = nextCustomer(s);
  const prev = [...CUSTOMERS].reverse().find((c) => customerUnlocked(s, c));
  return { from: prev?.ruf ?? 0, to: next?.ruf ?? null };
}

function floorsFor(s: GameState, c: CustomerDef): number[] {
  return c.floors.filter((i) => s.floors[i]?.unlocked);
}

function canOrder(s: GameState, c: CustomerDef): boolean {
  return customerUnlocked(s, c) && (c.kind === 'value' || floorsFor(s, c).length > 0);
}

/* ------------------------------------------------------------------------- */
/* Offers                                                                      */
/* ------------------------------------------------------------------------- */

/** Units per second a floor can actually deliver right now (logistics included). */
export function deliverableUnits(s: GameState, i: number): Decimal {
  const st = floorStatsAt(s, i, s.floors[i].level, true);
  const flow = analyzeFlow(s);
  const share = flow.production.gt(0) ? Math.min(1, Math.min(flow.lift.div(flow.production).toNumber(), flow.ship.div(flow.production).toNumber())) : 0;
  return st.unitsPerCycle.div(st.cycle).mul(share);
}

/** Rounds to two significant digits (25.000 rather than 24.731). */
export function nice(v: Decimal): Decimal {
  if (v.lte(0)) return D(0);
  if (v.lt(100)) return D(Math.max(1, Math.round(v.toNumber())));
  const e = Math.floor(v.log10()) - 1;
  const m = Math.round(v.div(D(10).pow(e)).toNumber());
  return D(m).mul(D(10).pow(e));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function writeOffer(s: GameState, taken: Set<string>): ContractOffer | null {
  const all = CUSTOMERS.filter((c) => canOrder(s, c));
  if (!all.length) return null;
  // prefer customers not on the board yet; newer customers come a little more often
  const fresh = all.filter((c) => !taken.has(c.id));
  const pool = fresh.length ? fresh : all;
  const weights = pool.map((c) => 1 + CUSTOMERS.indexOf(c) * 0.35);
  let r = nextRandom(s) * weights.reduce((a, b) => a + b, 0);
  let c = pool[pool.length - 1];
  for (let k = 0; k < pool.length; k++) {
    r -= weights[k];
    if (r < 0) {
      c = pool[k];
      break;
    }
  }
  const minutes = Math.round(lerp(c.minutes[0], c.minutes[1], nextRandom(s)));
  const seconds = minutes * 60;
  const demand = lerp(c.demand[0], c.demand[1], nextRandom(s));
  const income = analyzeFlow(s).income;
  let floor = -1;
  let target: Decimal;
  if (c.kind === 'units') {
    const floors = floorsFor(s, c);
    floor = nextRandom(s) < 0.7 ? floors[floors.length - 1] : floors[Math.floor(nextRandom(s) * floors.length)];
    target = nice(deliverableUnits(s, floor).mul(seconds * demand));
  } else {
    target = nice(income.mul(seconds * demand));
  }
  if (target.lte(0)) return null;
  const pay = nice(income.mul(seconds * c.pay)).max(D(50));
  const bonus = c.bonus && nextRandom(s) < c.bonus.chance ? { ...c.bonus.reward } : null;
  return { id: s.contracts.nextId++, customer: c.id, kind: c.kind, floor, target, seconds, pay, ruf: c.rufGain, bonus };
}

/** Fills empty slots and rewrites old offers when their time has come. */
export function refreshBoard(s: GameState): boolean {
  const c = s.contracts;
  if (!c.open) return false;
  let changed = false;
  for (let k = 0; k < c.offers.length; k++) {
    if (s.simTime < c.slotAt[k]) continue;
    const taken = new Set<string>(c.offers.filter((o, j) => o && j !== k).map((o) => o!.customer));
    if (c.active) taken.add(c.active.customer);
    const offer = writeOffer(s, taken);
    c.offers[k] = offer;
    c.slotAt[k] = s.simTime + (offer ? CONTRACTS.offerLife : CONTRACTS.refill);
    changed = true;
  }
  return changed;
}

/* ------------------------------------------------------------------------- */
/* Running a contract                                                          */
/* ------------------------------------------------------------------------- */

export function acceptContract(s: GameState, slot: number): ActiveContract | null {
  const c = s.contracts;
  const offer = c.offers[slot];
  if (!c.open || !offer || c.active) return null;
  c.active = { ...offer, progress: D(0), remaining: offer.seconds, status: 'active' };
  c.offers[slot] = null;
  c.slotAt[slot] = s.simTime + CONTRACTS.refill;
  return c.active;
}

export function declineOffer(s: GameState, slot: number): boolean {
  const c = s.contracts;
  if (!c.offers[slot]) return false;
  c.offers[slot] = null;
  c.slotAt[slot] = s.simTime + CONTRACTS.refill;
  return true;
}

/** Gives a running contract back (no Ruf, no payment). */
export function cancelContract(s: GameState): boolean {
  if (s.contracts.active?.status !== 'active') return false;
  s.contracts.active = null;
  s.stats.records.contractStreak = 0;
  return true;
}

/** Counts down the deadline (simulation step, also offline). */
export function tickContract(s: GameState, dt: number, ctx: SimContext): void {
  const a = s.contracts.active;
  if (!a || a.status !== 'active') return;
  a.remaining -= dt;
  if (a.remaining <= 0) {
    a.remaining = 0;
    a.status = 'failed';
    s.contracts.failed += 1;
    s.stats.records.contractStreak = 0;
    ctx.events?.push({ type: 'contractFailed', customer: a.customer });
  }
}

function progress(a: ActiveContract, amount: Decimal, ctx: SimContext) {
  a.progress = a.progress.add(amount);
  if (a.progress.gte(a.target)) {
    a.progress = a.target;
    a.status = 'delivered';
    ctx.events?.push({ type: 'contractDelivered', customer: a.customer });
  }
}

/** A floor finished a batch of `units` (simulation step). */
export function noteProduced(s: GameState, floor: number, units: Decimal, ctx: SimContext): void {
  const a = s.contracts.active;
  if (a && a.status === 'active' && a.kind === 'units' && a.floor === floor) progress(a, units, ctx);
}

/** Vans sold goods for `value` € (simulation step). */
export function noteSold(s: GameState, value: Decimal, ctx: SimContext): void {
  const a = s.contracts.active;
  if (a && a.status === 'active' && a.kind === 'value') progress(a, value, ctx);
}

export interface ContractPayout {
  customer: CustomerDef;
  pay: Decimal;
  ruf: number;
  bonus: ActiveContract['bonus'];
  /** Customer that the Ruf just unlocked. */
  unlocked: CustomerDef | null;
}

/** Collects a delivered contract, or clears a failed one. */
export function closeContract(s: GameState): ContractPayout | null {
  const c = s.contracts;
  const a = c.active;
  if (!a || a.status === 'active') return null;
  c.active = null;
  if (a.status === 'failed') return null;
  const before = nextCustomer(s);
  s.money = s.money.add(a.pay);
  s.stats.totalEarned = s.stats.totalEarned.add(a.pay);
  c.ruf += a.ruf;
  c.delivered += 1;
  const r = s.stats.records;
  r.contractStreak += 1;
  if (r.contractStreak > r.bestContractStreak) r.bestContractStreak = r.contractStreak;
  if (!r.customers.includes(a.customer)) r.customers.push(a.customer);
  if (a.bonus) grantReward(s, a.bonus);
  const unlocked = before && customerUnlocked(s, before) ? before : null;
  return { customer: CUSTOMER_BY_ID[a.customer], pay: a.pay, ruf: a.ruf, bonus: a.bonus, unlocked };
}

/** Brand sale: a delivered contract is still credited (Ruf, bonus), the rest starts over. */
export function contractsOnBrandSale(s: GameState): void {
  const c = s.contracts;
  if (c.active?.status === 'delivered') closeContract(s);
  c.active = null;
  c.offers = c.offers.map(() => null);
  c.slotAt = c.slotAt.map((_, k) => s.simTime + 20 + k * 20);
}

export function contractShare(a: Pick<ActiveContract, 'progress' | 'target'>): number {
  if (a.target.lte(0)) return 1;
  return Math.min(1, a.progress.div(a.target).toNumber());
}
