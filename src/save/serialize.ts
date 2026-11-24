import { BALANCE } from '../config/balance';
import { deser, ser } from '../core/num';
import { SAVE_VERSION, defaultSettings } from '../sim/init';
import type { BuyMode, GameState, LiftPhase, Manager, ManagerBonus, ManagerCategory, StationId, VanPhase } from '../sim/types';
import { migrate } from './migrations';

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
    stats: { ...s.stats, totalEarned: ser(s.stats.totalEarned) },
    managers: s.managers.map((m) => ({ ...m, look: { ...m.look } })),
    boosts: s.boosts.map((b) => ({ ...b })),
    golden: { ...s.golden, active: s.golden.active ? { ...s.golden.active } : null },
    prestige: { ...s.prestige, runStartEarned: ser(s.prestige.runStartEarned) },
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

const STATIONS: StationId[] = ['f0', 'f1', 'f2', 'f3', 'f4', 'lift', 'ship'];
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
    },
    quest: { index: int(obj(o.quest, 'quest').index, 'quest.index', 0, 10000) },
    prestige: {
      crowns: int(prestige.crowns, 'prestige.crowns', 0, Number.MAX_SAFE_INTEGER),
      runs: int(prestige.runs, 'prestige.runs', 0, 1e9),
      runStartEarned: dec(prestige.runStartEarned, 'prestige.runStartEarned'),
      runStartPlay: num(prestige.runStartPlay, 'prestige.runStartPlay', 0),
      bestFloor5: prestige.bestFloor5 === null || prestige.bestFloor5 === undefined ? null : num(prestige.bestFloor5, 'prestige.bestFloor5', 0),
    },
    rng: int(o.rng, 'rng', 0, 4294967295) >>> 0,
    settings: {
      notation: settings.notation === 'scientific' ? 'scientific' : 'short',
      sound: typeof settings.sound === 'boolean' ? settings.sound : def.sound,
      music: typeof settings.music === 'boolean' ? settings.music : def.music,
      haptics: typeof settings.haptics === 'boolean' ? settings.haptics : def.haptics,
      buyMode: buyModes.includes(settings.buyMode as BuyMode) ? (settings.buyMode as BuyMode) : def.buyMode,
    },
  };
  repairReferences(s);
  return s;
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
