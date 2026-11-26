import { BALANCE } from '../config/balance';
import { deser, ser } from '../core/num';
import { SAVE_VERSION, defaultRecords, defaultSettings } from '../sim/init';
import type { BuyMode, ContractOffer, ContractsState, GameState, LiftPhase, Manager, ManagerBonus, ManagerCategory, Records, StationId, VanPhase, WinterState } from '../sim/types';
import { migrate } from './migrations';
import { RESEARCH_BY_ID, RESEARCH_IDS, type ResearchId } from '../config/research';
import { defaultResearch } from '../sim/research';
import { ACHIEVEMENTS, DAILY_BY_ID } from '../config/goals';
import { localTimeZone } from '../sim/goals';
import { LAST_DOOR, SHOP } from '../config/winter';
import { CUSTOMER_BY_ID, type CustomerId } from '../config/contracts';
import { TREASURY_BY_ID, TREASURY_IDS, type TreasuryId } from '../config/treasury';
import type { GoalReward } from '../config/goals';
import { defaultContracts } from '../sim/contracts';
import { freshWinter } from '../sim/winter';

const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
}

export const SAVE_FORMAT = 'cocoa-crown-save';

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: number;
  checksum: string;
  data: string;
}

/** FNV-1a 32 bit. Detects truncated or hand-edited saves, not a security measure. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function toPlain(s: GameState): Record<string, unknown> {
  return {
    ...s,
    money: ser(s.money),
    floors: s.floors.map((f) => ({ ...f, buffer: ser(f.buffer) })),
    lift: { ...s.lift, cargo: ser(s.lift.cargo) },
    ship: { ...s.ship, depot: ser(s.ship.depot), vans: s.ship.vans.map((v) => ({ ...v, cargo: ser(v.cargo) })) },
    stats: {
      ...s.stats,
      totalEarned: ser(s.stats.totalEarned),
      records: { ...s.stats.records, floorBest: [...s.stats.records.floorBest], levelRank: [...s.stats.records.levelRank], customers: [...s.stats.records.customers] },
    },
    managers: s.managers.map((m) => ({ ...m, look: { ...m.look } })),
    boosts: s.boosts.map((b) => ({ ...b })),
    golden: { ...s.golden, active: s.golden.active ? { ...s.golden.active } : null },
    prestige: { ...s.prestige, runStartEarned: ser(s.prestige.runStartEarned), treasury: { ...s.prestige.treasury } },
    contracts: {
      ...s.contracts,
      offers: s.contracts.offers.map((o) => (o ? offerToPlain(o) : null)),
      slotAt: [...s.contracts.slotAt],
      active: s.contracts.active
        ? { ...offerToPlain(s.contracts.active), progress: ser(s.contracts.active.progress), remaining: s.contracts.active.remaining, status: s.contracts.active.status }
        : null,
    },
    research: { ...s.research, ranks: { ...s.research.ranks }, active: s.research.active ? { ...s.research.active } : null },
    goals: { claimed: [...s.goals.claimed] },
    rewards: { ...s.rewards },
    daily: {
      ...s.daily,
      goals: s.daily.goals.map((g) => ({ ...g })),
      prevIds: [...s.daily.prevIds],
      floorsDone: [...s.daily.floorsDone],
      stationsTapped: [...s.daily.stationsTapped],
    },
    winter: {
      ...s.winter,
      floors: s.winter.floors.map((f) => ({ ...f })),
      opened: [...s.winter.opened],
      claimed: [...s.winter.claimed],
      shop: { ...s.winter.shop },
      shopDay: { ...s.winter.shopDay },
    },
  };
}

export function encodeSave(s: GameState, now = Date.now()): SaveEnvelope {
  const data = JSON.stringify(toPlain(s));
  return { format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: now, checksum: checksum(data), data };
}

export class SaveError extends Error {}

export function decodeSave(env: unknown): GameState {
  if (!env || typeof env !== 'object') throw new SaveError('Kein Spielstand gefunden.');
  const e = env as Partial<SaveEnvelope>;
  if (e.format !== SAVE_FORMAT) throw new SaveError('Unbekanntes Dateiformat.');
  if (typeof e.data !== 'string' || typeof e.checksum !== 'string') throw new SaveError('Spielstand unvollständig.');
  if (checksum(e.data) !== e.checksum) throw new SaveError('Prüfsumme stimmt nicht – Spielstand beschädigt.');
  let raw: unknown;
  try {
    raw = JSON.parse(e.data);
  } catch {
    throw new SaveError('Spielstand nicht lesbar.');
  }
  const version = typeof e.version === 'number' ? e.version : 0;
  if (version > SAVE_VERSION) throw new SaveError('Spielstand stammt aus einer neueren Spielversion.');
  const migrated = migrate(raw as Record<string, unknown>, version, SAVE_VERSION);
  return fromPlain(migrated);
}

/* ------------------------------------------------------------------------- */
/* Validation                                                                 */
/* ------------------------------------------------------------------------- */

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SaveError(`Feld fehlt: ${what}`);
  return v as Obj;
}
function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new SaveError(`Liste fehlt: ${what}`);
  return v;
}
function num(v: unknown, what: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SaveError(`Ungültiger Wert: ${what}`);
  return Math.min(max, Math.max(min, v));
}
function int(v: unknown, what: string, min: number, max: number): number {
  return Math.round(num(v, what, min, max));
}
/** Lifetime records (0.10.0); anything missing or broken falls back to the defaults. */
function decodeRecords(v: unknown): Records {
  const r = defaultRecords();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return r;
  const o = v as Obj;
  const n = (x: unknown, d: number, max = Number.MAX_SAFE_INTEGER) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : d);
  const levels = (x: unknown, d: number[]) => (Array.isArray(x) ? d.map((dv, i) => Math.round(n(x[i], dv, 1e6))) : d);
  r.floorBest = levels(o.floorBest, r.floorBest);
  r.levelRank = levels(o.levelRank, r.levelRank);
  r.liftBest = Math.round(n(o.liftBest, 1, 1e6));
  r.shipBest = Math.round(n(o.shipBest, 1, 1e6));
  r.bestIncome = n(o.bestIncome, 0, 1e300);
  r.flowNow = n(o.flowNow, 0, 1e9);
  r.bestFlow = n(o.bestFlow, 0, 1e9);
  r.bestSale = Math.round(n(o.bestSale, 0));
  r.bestFloor8 = typeof o.bestFloor8 === 'number' && Number.isFinite(o.bestFloor8) ? Math.max(0, o.bestFloor8) : null;
  r.contractStreak = Math.round(n(o.contractStreak, 0));
  r.bestContractStreak = Math.round(n(o.bestContractStreak, 0));
  r.customers = Array.isArray(o.customers) ? [...new Set(o.customers.filter((c): c is string => typeof c === 'string' && c in CUSTOMER_BY_ID))] : [];
  r.maxStaffed = Math.round(n(o.maxStaffed, 0, 64));
  return r;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new SaveError(`Ungültiger Wert: ${what}`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new SaveError(`Ungültiger Text: ${what}`);
  return v;
}
function dec(v: unknown, what: string) {
  try {
    const d = deser(v);
    return d.lt(0) ? deser(0) : d;
  } catch {
    throw new SaveError(`Ungültige Zahl: ${what}`);
  }
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], what: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new SaveError(`Ungültiger Wert: ${what}`);
  return v as T;
}

const STATIONS: StationId[] = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'lift', 'ship'];
const CATEGORIES: ManagerCategory[] = ['floor', 'lift', 'ship'];
const BONUSES: ManagerBonus[] = ['speed', 'yield', 'cost', 'capacity', 'price'];
const LIFT_PHASES: LiftPhase[] = ['idle', 'up', 'stop', 'down', 'unload'];
const VAN_PHASES: VanPhase[] = ['dock', 'out', 'back'];

export function fromPlain(o: Obj): GameState {
  const floorsRaw = arr(o.floors, 'floors');
  if (floorsRaw.length !== BALANCE.floors.length) throw new SaveError('Etagenzahl passt nicht.');
  const maxLvl = BALANCE.floor.maxLevel;
  const floors = floorsRaw.map((fr, i) => {
    const f = obj(fr, `floors[${i}]`);
    return {
      unlocked: bool(f.unlocked, 'unlocked'),
      level: int(f.level, 'level', 1, maxLvl),
      progress: num(f.progress, 'progress', 0, 1),
      running: bool(f.running, 'running'),
      buffer: dec(f.buffer, 'buffer'),
      managerId: f.managerId === null ? null : str(f.managerId, 'managerId'),
      stalled: bool(f.stalled, 'stalled'),
      tapBudget: num(f.tapBudget ?? BALANCE.tap.maxPerSecond, 'tapBudget', 0, BALANCE.tap.maxPerSecond),
      rush: num(f.rush ?? 0, 'rush', 0, 1e6),
    };
  });
  if (!floors[0].unlocked) floors[0].unlocked = true;

  const l = obj(o.lift, 'lift');
  const lift = {
    level: int(l.level, 'lift.level', 1, BALANCE.lift.maxLevel),
    managerId: l.managerId === null ? null : str(l.managerId, 'lift.managerId'),
    phase: oneOf(l.phase, LIFT_PHASES, 'lift.phase'),
    pos: num(l.pos, 'lift.pos', 0, BALANCE.floors.length),
    timer: num(l.timer, 'lift.timer', 0, 60),
    cargo: dec(l.cargo, 'lift.cargo'),
    request: bool(l.request, 'lift.request'),
    blocked: bool(l.blocked, 'lift.blocked'),
    tapBudget: num(l.tapBudget ?? BALANCE.tap.maxPerSecond, 'lift.tapBudget', 0, BALANCE.tap.maxPerSecond),
    rush: num(l.rush ?? 0, 'lift.rush', 0, 1e6),
  };

  const sh = obj(o.ship, 'ship');
  const ship = {
    level: int(sh.level, 'ship.level', 1, BALANCE.shipping.maxLevel),
    managerId: sh.managerId === null ? null : str(sh.managerId, 'ship.managerId'),
    vans: arr(sh.vans, 'ship.vans').slice(0, BALANCE.shipping.maxVans).map((vr, i) => {
      const v = obj(vr, `van[${i}]`);
      return { phase: oneOf(v.phase, VAN_PHASES, 'van.phase'), timer: num(v.timer, 'van.timer', 0, 600), cargo: dec(v.cargo, 'van.cargo') };
    }),
    depot: dec(sh.depot, 'ship.depot'),
    sinceDispatch: num(sh.sinceDispatch, 'ship.sinceDispatch', 0, 1e6),
    request: bool(sh.request, 'ship.request'),
    tapBudget: num(sh.tapBudget ?? BALANCE.tap.maxPerSecond, 'ship.tapBudget', 0, BALANCE.tap.maxPerSecond),
    rush: num(sh.rush ?? 0, 'ship.rush', 0, 1e6),
  };
  if (!ship.vans.length) ship.vans.push({ phase: 'dock', timer: 0, cargo: dec('0', 'van') });

  const managers: Manager[] = arr(o.managers, 'managers').map((mr, i) => {
    const m = obj(mr, `managers[${i}]`);
    const look = obj(m.look, 'look');
    return {
      id: str(m.id, 'manager.id'),
      name: str(m.name, 'manager.name'),
      category: oneOf(m.category, CATEGORIES, 'manager.category'),
      rarity: int(m.rarity, 'manager.rarity', 0, BALANCE.managers.rarities.length - 1),
      bonus: oneOf(m.bonus, BONUSES, 'manager.bonus'),
      look: { skin: int(look.skin, 'skin', 0, 9), hair: int(look.hair, 'hair', 0, 9), hairColor: int(look.hairColor, 'hairColor', 0, 9), accessory: int(look.accessory, 'acc', 0, 9) },
      assignedTo: m.assignedTo === null ? null : oneOf(m.assignedTo, STATIONS, 'manager.assignedTo'),
      home: m.home === null || m.home === undefined ? null : oneOf(m.home, STATIONS, 'manager.home'),
      skillActive: num(m.skillActive, 'skillActive', 0, 3600),
      skillCooldown: num(m.skillCooldown, 'skillCooldown', 0, 3600),
    };
  });

  const hires = obj(o.hires, 'hires');
  const stats = obj(o.stats, 'stats');
  const golden = obj(o.golden, 'golden');
  const prestige = obj(o.prestige, 'prestige');
  const goalsRaw = obj(o.goals ?? {}, 'goals');
  const rewardsRaw = obj(o.rewards ?? {}, 'rewards');
  const dailyRaw = obj(o.daily ?? {}, 'daily');
  const research = obj(o.research ?? {}, 'research');
  const winterRaw = obj(o.winter ?? {}, 'winter');
  const ranksRaw = obj(research.ranks ?? {}, 'research.ranks');
  const ranks = defaultResearch().ranks;
  for (const id of RESEARCH_IDS) ranks[id] = ranksRaw[id] === undefined ? 0 : int(ranksRaw[id], `research.${id}`, 0, RESEARCH_BY_ID[id].maxRank);
  const activeRaw = research.active === null || research.active === undefined ? null : obj(research.active, 'research.active');
  const goldenActive = golden.active === null || golden.active === undefined ? null : obj(golden.active, 'golden.active');
  const settings = obj(o.settings ?? defaultSettings(), 'settings');
  const def = defaultSettings();
  const buyModes: BuyMode[] = [1, 10, 25, 100, 'max'];

  const s: GameState = {
    version: SAVE_VERSION,
    createdAt: num(o.createdAt, 'createdAt', 0),
    lastWallTime: num(o.lastWallTime, 'lastWallTime', 0),
    simTime: num(o.simTime, 'simTime', 0),
    money: dec(o.money, 'money'),
    floors,
    lift,
    ship,
    managers,
    hires: { floor: int(hires.floor, 'hires.floor', 0, 1e6), lift: int(hires.lift, 'hires.lift', 0, 1e6), ship: int(hires.ship, 'hires.ship', 0, 1e6) },
    nextManagerId: int(o.nextManagerId, 'nextManagerId', 1, 1e9),
    boosts: arr(o.boosts, 'boosts').map((br) => {
      const b = obj(br, 'boost');
      return {
        kind: oneOf(b.kind, ['rush', 'express'] as const, 'boost.kind'),
        factor: num(b.factor, 'boost.factor', 1, 100),
        remaining: num(b.remaining, 'boost.remaining', 0, 3600),
        total: num(b.total, 'boost.total', 0, 3600),
      };
    }),
    golden: {
      nextIn: num(golden.nextIn, 'golden.nextIn', 0, 3600),
      active: goldenActive ? { remaining: num(goldenActive.remaining, 'g.remaining', 0, 60), seed: num(goldenActive.seed, 'g.seed', 0) } : null,
    },
    stats: {
      totalEarned: dec(stats.totalEarned, 'totalEarned'),
      batches: int(stats.batches, 'batches', 0, Number.MAX_SAFE_INTEGER),
      liftTrips: int(stats.liftTrips, 'liftTrips', 0, Number.MAX_SAFE_INTEGER),
      vanTrips: int(stats.vanTrips, 'vanTrips', 0, Number.MAX_SAFE_INTEGER),
      taps: int(stats.taps, 'taps', 0, Number.MAX_SAFE_INTEGER),
      goldenCaught: int(stats.goldenCaught, 'goldenCaught', 0, Number.MAX_SAFE_INTEGER),
      skillsUsed: int(stats.skillsUsed, 'skillsUsed', 0, Number.MAX_SAFE_INTEGER),
      managersHired: int(stats.managersHired, 'managersHired', 0, Number.MAX_SAFE_INTEGER),
      playSeconds: num(stats.playSeconds, 'playSeconds', 0),
      offlineSeconds: num(stats.offlineSeconds, 'offlineSeconds', 0),
      maxFloorLevel: int(stats.maxFloorLevel ?? 1, 'maxFloorLevel', 1, 1e6),
      maxFloors: int(stats.maxFloors ?? 1, 'maxFloors', 1, 64),
      records: decodeRecords(stats.records),
    },
    quest: { index: int(obj(o.quest, 'quest').index, 'quest.index', 0, 10000) },
    prestige: {
      crowns: int(prestige.crowns, 'prestige.crowns', 0, Number.MAX_SAFE_INTEGER),
      runs: int(prestige.runs, 'prestige.runs', 0, 1e9),
      runStartEarned: dec(prestige.runStartEarned, 'prestige.runStartEarned'),
      runStartPlay: num(prestige.runStartPlay, 'prestige.runStartPlay', 0),
      bestFloor5: prestige.bestFloor5 === null || prestige.bestFloor5 === undefined ? null : num(prestige.bestFloor5, 'prestige.bestFloor5', 0),
      spent: prestige.spent === undefined ? 0 : Math.min(int(prestige.spent, 'prestige.spent', 0, Number.MAX_SAFE_INTEGER), int(prestige.crowns, 'prestige.crowns', 0, Number.MAX_SAFE_INTEGER)),
      treasury: decodeTreasury(prestige.treasury),
    },
    research: {
      points: int(research.points ?? 0, 'research.points', 0, Number.MAX_SAFE_INTEGER),
      earned: int(research.earned ?? 0, 'research.earned', 0, Number.MAX_SAFE_INTEGER),
      ranks,
      active:
        activeRaw && RESEARCH_IDS.includes(activeRaw.id as ResearchId) && ranks[activeRaw.id as ResearchId] < RESEARCH_BY_ID[activeRaw.id as ResearchId].maxRank
          ? {
              id: activeRaw.id as ResearchId,
              remaining: num(activeRaw.remaining, 'research.remaining', 0, 1e7),
              total: num(activeRaw.total, 'research.total', 1, 1e7),
            }
          : null,
      open: typeof research.open === 'boolean' ? research.open : false,
    },
    goals: { claimed: strList(goalsRaw.claimed).filter((id) => ACHIEVEMENT_IDS.has(id)) },
    rewards: {
      freeHires: int(rewardsRaw.freeHires ?? 0, 'rewards.freeHires', 0, 1e6),
      goldenBeans: int(rewardsRaw.goldenBeans ?? 0, 'rewards.goldenBeans', 0, 1e6),
    },
    daily: {
      tz: typeof dailyRaw.tz === 'string' && dailyRaw.tz ? dailyRaw.tz : localTimeZone(),
      day: typeof dailyRaw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dailyRaw.day) ? dailyRaw.day : '',
      goals: (Array.isArray(dailyRaw.goals) ? dailyRaw.goals : [])
        .map((g) => obj(g, 'daily.goal'))
        .filter((g) => typeof g.id === 'string' && DAILY_BY_ID[g.id as string])
        .slice(0, 3)
        .map((g) => ({
          id: g.id as string,
          target: num(g.target, 'daily.target', 1),
          progress: num(g.progress, 'daily.progress', 0),
          claimed: g.claimed === true,
        })),
      prevIds: strList(dailyRaw.prevIds),
      floorsDone: (Array.isArray(dailyRaw.floorsDone) ? dailyRaw.floorsDone : []).filter((x): x is number => Number.isInteger(x)),
      stationsTapped: strList(dailyRaw.stationsTapped),
      streak: int(dailyRaw.streak ?? 0, 'daily.streak', 0, 1e6),
      lastCompleteDay: typeof dailyRaw.lastCompleteDay === 'string' ? dailyRaw.lastCompleteDay : '',
      streakHireGiven: dailyRaw.streakHireGiven === true,
    },
    winter: decodeWinter(winterRaw),
    contracts: decodeContracts(o.contracts),
    rng: int(o.rng, 'rng', 0, 4294967295) >>> 0,
    settings: {
      notation: settings.notation === 'scientific' ? 'scientific' : 'short',
      sound: typeof settings.sound === 'boolean' ? settings.sound : def.sound,
      music: typeof settings.music === 'boolean' ? settings.music : def.music,
      haptics: typeof settings.haptics === 'boolean' ? settings.haptics : def.haptics,
      buyMode: buyModes.includes(settings.buyMode as BuyMode) ? (settings.buyMode as BuyMode) : def.buyMode,
      winterDecor: typeof settings.winterDecor === 'boolean' ? settings.winterDecor : def.winterDecor,
    },
  };
  repairReferences(s);
  return s;
}

function offerToPlain(o: ContractOffer): Record<string, unknown> {
  return {
    id: o.id,
    customer: o.customer,
    kind: o.kind,
    floor: o.floor,
    target: ser(o.target),
    seconds: o.seconds,
    pay: ser(o.pay),
    ruf: o.ruf,
    bonus: o.bonus ? { ...o.bonus } : null,
  };
}

function decodeBonus(v: unknown): GoalReward | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Obj;
  if (b.kind !== 'recipePoints' && b.kind !== 'managerHireCredit' && b.kind !== 'goldenBean') return null;
  return { kind: b.kind, amount: int(b.amount, 'contract.bonus', 1, 1000) };
}

function decodeOffer(v: unknown): ContractOffer | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Obj;
  if (typeof o.customer !== 'string' || !(o.customer in CUSTOMER_BY_ID)) return null;
  const kind = o.kind === 'value' ? 'value' : 'units';
  return {
    id: int(o.id, 'contract.id', 0, Number.MAX_SAFE_INTEGER),
    customer: o.customer as CustomerId,
    kind,
    floor: kind === 'value' ? -1 : int(o.floor, 'contract.floor', 0, BALANCE.floors.length - 1),
    target: dec(o.target, 'contract.target'),
    seconds: num(o.seconds, 'contract.seconds', 1, 24 * 3600),
    pay: dec(o.pay, 'contract.pay'),
    ruf: int(o.ruf, 'contract.ruf', 0, 1000),
    bonus: decodeBonus(o.bonus),
  };
}

function decodeContracts(v: unknown): ContractsState {
  const c = defaultContracts();
  if (!v || typeof v !== 'object') return c;
  const o = v as Obj;
  c.open = o.open === true;
  c.ruf = o.ruf === undefined ? 0 : int(o.ruf, 'contracts.ruf', 0, Number.MAX_SAFE_INTEGER);
  c.nextId = o.nextId === undefined ? 1 : int(o.nextId, 'contracts.nextId', 1, Number.MAX_SAFE_INTEGER);
  c.delivered = o.delivered === undefined ? 0 : int(o.delivered, 'contracts.delivered', 0, Number.MAX_SAFE_INTEGER);
  c.failed = o.failed === undefined ? 0 : int(o.failed, 'contracts.failed', 0, Number.MAX_SAFE_INTEGER);
  const offers = Array.isArray(o.offers) ? o.offers : [];
  const slotAt = Array.isArray(o.slotAt) ? o.slotAt : [];
  c.offers = c.offers.map((_, k) => decodeOffer(offers[k]));
  c.slotAt = c.slotAt.map((_, k) => (slotAt[k] === undefined ? 0 : num(slotAt[k], 'contracts.slotAt', -1e12, 1e15)));
  const a = o.active && typeof o.active === 'object' ? (o.active as Obj) : null;
  const offer = a ? decodeOffer(a) : null;
  if (a && offer) {
    const status = a.status === 'delivered' || a.status === 'failed' ? a.status : 'active';
    c.active = {
      ...offer,
      progress: dec(a.progress, 'contract.progress'),
      remaining: num(a.remaining, 'contract.remaining', 0, 24 * 3600),
      status,
    };
  }
  return c;
}

function decodeTreasury(v: unknown): Partial<Record<TreasuryId, number>> {
  const out: Partial<Record<TreasuryId, number>> = {};
  if (!v || typeof v !== 'object') return out;
  const t = v as Obj;
  for (const id of TREASURY_IDS) if (t[id] !== undefined) out[id] = int(t[id], `treasury.${id}`, 0, TREASURY_BY_ID[id].costs.length);
  return out;
}

function dayList(v: unknown): number[] {
  const out: number[] = [];
  if (!Array.isArray(v)) return out;
  for (const x of v) if (Number.isInteger(x) && x >= 1 && x <= LAST_DOOR && !out.includes(x)) out.push(x);
  return out;
}

function decodeWinter(w: Obj): WinterState {
  const fresh = freshWinter(0);
  const floorsRaw = Array.isArray(w.floors) ? w.floors : [];
  const floors = fresh.floors.map((def, i) => {
    const f = floorsRaw[i] && typeof floorsRaw[i] === 'object' ? (floorsRaw[i] as Obj) : {};
    return {
      built: i === 0 ? true : f.built === true,
      level: f.level === undefined ? def.level : int(f.level, 'winter.level', 1, 10000),
      progress: f.progress === undefined ? 0 : num(f.progress, 'winter.progress', 0, 1),
      running: f.running === true,
    };
  });
  const shopRaw = w.shop && typeof w.shop === 'object' && !Array.isArray(w.shop) ? (w.shop as Obj) : {};
  const dayRaw = w.shopDay && typeof w.shopDay === 'object' && !Array.isArray(w.shopDay) ? (w.shopDay as Obj) : {};
  const shop: Record<string, number> = {};
  const shopDay: Record<string, number> = {};
  for (const item of SHOP) {
    if (shopRaw[item.id] !== undefined) shop[item.id] = int(shopRaw[item.id], 'winter.shop', 0, item.max);
    if (dayRaw[item.id] !== undefined) shopDay[item.id] = int(dayRaw[item.id], 'winter.shopDay', 0, LAST_DOOR);
  }
  const claimed = dayList(w.claimed);
  const opened = dayList(w.opened);
  for (const d of claimed) if (!opened.includes(d)) opened.push(d);
  return {
    season: w.season === undefined ? 0 : int(w.season, 'winter.season', 0, 9999),
    stars: w.stars === undefined ? 0 : num(w.stars, 'winter.stars', 0, 1e300),
    earned: w.earned === undefined ? 0 : num(w.earned, 'winter.earned', 0, 1e300),
    floors,
    opened,
    claimed,
    shop,
    shopDay,
  };
}

/** Makes manager ↔ station links consistent even if a save was edited. */
export function repairReferences(s: GameState): void {
  const byId = new Map(s.managers.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const fix = (id: string | null, station: StationId): string | null => {
    if (!id) return null;
    const m = byId.get(id);
    if (!m || seen.has(id) || m.assignedTo !== station) return null;
    seen.add(id);
    return id;
  };
  s.floors.forEach((f, i) => {
    f.managerId = f.unlocked ? fix(f.managerId, `f${i}` as StationId) : null;
  });
  s.lift.managerId = fix(s.lift.managerId, 'lift');
  s.ship.managerId = fix(s.ship.managerId, 'ship');
  for (const m of s.managers) if (!seen.has(m.id)) m.assignedTo = null;
}
