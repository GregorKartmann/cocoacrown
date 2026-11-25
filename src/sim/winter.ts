/**
 * Advent-Event „Lebkuchen-Manufaktur“: calendar, mini factory, doors, market.
 *
 * Everything that depends on the date takes the device's wall clock in ms and
 * reads it with the local Date getters, so 1 December starts at 00:00 local
 * time wherever the player is. The event production is advanced by GameStore
 * (live frames and absences), not by the deterministic main simulation.
 */
import { BALANCE } from '../config/balance';
import {
  DOORS,
  LAST_DOOR,
  SHOP,
  WINTER_FLOORS,
  WINTER_MANAGER_NAME,
  WINTER_MILESTONE,
  WINTER_OFFLINE_HOURS,
  WINTER_OFFLINE_HOURS_PERK,
  type Decor,
  type DoorReward,
  type Perk,
  type ShopItem,
} from '../config/winter';
import { grantReward } from './goals';
import type { GameState, Manager, WinterFloorState, WinterState } from './types';

/* ------------------------------------------------------------------------- */
/* Calendar                                                                    */
/* ------------------------------------------------------------------------- */

export type AdventPhase =
  | { kind: 'off' }
  /** November: the bakery already bakes, doors and market wait for 1 December. */
  | { kind: 'preview'; season: number; startsAt: number }
  /** 1–26 December: door `day` and all earlier ones can be opened. */
  | { kind: 'active'; season: number; day: number; endsAt: number }
  /** 27–31 December: the event is over, its results stay visible. */
  | { kind: 'ended'; season: number };

/** Event phase at wall clock `now` (ms), read in the device's local time. */
export function adventPhase(now: number): AdventPhase {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  if (m === 10) return { kind: 'preview', season: y, startsAt: new Date(y, 11, 1).getTime() };
  if (m === 11 && day <= LAST_DOOR) return { kind: 'active', season: y, day, endsAt: seasonEnd(y) };
  if (m === 11) return { kind: 'ended', season: y };
  return { kind: 'off' };
}

/** Local midnight that ends the event (start of 27 December). */
export function seasonEnd(season: number): number {
  return new Date(season, 11, LAST_DOOR + 1).getTime();
}

/** The event screen can be opened (November to 31 December). */
export function eventVisible(p: AdventPhase): boolean {
  return p.kind !== 'off';
}

/** The Lebkuchen-Manufaktur produces (November preview and 1–26 December). */
export function eventRunning(p: AdventPhase): boolean {
  return p.kind === 'preview' || p.kind === 'active';
}

/** Winter decoration in the tower is shown in December. */
export function decorSeason(p: AdventPhase): boolean {
  return p.kind === 'active' || p.kind === 'ended';
}

/** Whole calendar days from `now` to the local midnight `target`. */
export function daysUntil(now: number, target: number): number {
  const a = new Date(now);
  const b = new Date(target);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.max(0, Math.round((db - da) / 86400000));
}

/** Milliseconds until the next local midnight (next door). */
export function msToNextDoor(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}

/* ------------------------------------------------------------------------- */
/* State                                                                       */
/* ------------------------------------------------------------------------- */

function freshFloor(i: number): WinterFloorState {
  return { built: i === 0, level: 1, progress: 0, running: false };
}

export function freshWinter(season = 0): WinterState {
  return { season, stars: 0, earned: 0, floors: WINTER_FLOORS.map((_, i) => freshFloor(i)), opened: [], claimed: [], shop: {}, shopDay: {} };
}

/**
 * A new season starts with a fresh Lebkuchen-Manufaktur. The Weihnachts-
 * manager and everything already paid out to the cocoa factory stay.
 * Returns true when the state was reset.
 */
export function syncSeason(s: GameState, p: AdventPhase): boolean {
  if (!eventRunning(p)) return false;
  const season = (p as { season: number }).season;
  if (s.winter.season === season) return false;
  s.winter = freshWinter(season);
  return true;
}

/* ------------------------------------------------------------------------- */
/* Perks and decoration (derived from the doors already collected)             */
/* ------------------------------------------------------------------------- */

const DOOR_BY_DAY = new Map(DOORS.map((d) => [d.day, d]));

export function door(day: number) {
  return DOOR_BY_DAY.get(day);
}

export function hasPerk(s: GameState, perk: Perk): boolean {
  for (const day of s.winter.claimed) {
    const d = DOOR_BY_DAY.get(day);
    if (d?.rewards.some((r) => r.kind === 'perk' && r.perk === perk)) return true;
  }
  return false;
}

export function ownedDecor(s: GameState): Set<Decor> {
  const out = new Set<Decor>();
  for (const day of s.winter.claimed) {
    for (const r of DOOR_BY_DAY.get(day)?.rewards ?? []) if (r.kind === 'decor') out.add(r.decor);
  }
  return out;
}

/** Decoration to draw in the tower right now (December, setting on). */
export function visibleDecor(s: GameState, p: AdventPhase): Set<Decor> {
  if (!s.settings.winterDecor || !decorSeason(p)) return new Set();
  if (p.kind !== 'off' && 'season' in p && s.winter.season !== p.season) return new Set();
  return ownedDecor(s);
}

/* ------------------------------------------------------------------------- */
/* Lebkuchen-Manufaktur                                                        */
/* ------------------------------------------------------------------------- */

const FLOOR_PERK: Perk[] = ['auto0', 'auto1', 'auto2'];
const BUILD_PERK: (Perk | null)[] = [null, 'floor1', 'floor2'];

/** The floor's door is open (it can be built, or already stands). */
export function floorAvailable(s: GameState, i: number): boolean {
  const p = BUILD_PERK[i];
  return p === null || hasPerk(s, p);
}

export function floorAuto(s: GameState, i: number): boolean {
  return hasPerk(s, FLOOR_PERK[i]);
}

/** Door that makes floor i buildable / automatic (for hints). */
export function doorOfPerk(perk: Perk): number {
  return DOORS.find((d) => d.rewards.some((r) => r.kind === 'perk' && r.perk === perk))?.day ?? 0;
}
export const buildDoor = (i: number) => (BUILD_PERK[i] ? doorOfPerk(BUILD_PERK[i]!) : 0);
export const autoDoor = (i: number) => doorOfPerk(FLOOR_PERK[i]);

export function starMultiplier(s: GameState): number {
  return 1 + (hasPerk(s, 'mehr25') ? 0.25 : 0) + (hasPerk(s, 'mehr50') ? 0.5 : 0);
}

/** Zimtsterne of one batch of floor i at its current level. */
export function batchStars(s: GameState, i: number, level = s.winter.floors[i].level): number {
  const def = WINTER_FLOORS[i];
  const doubling = 2 ** Math.floor(level / WINTER_MILESTONE);
  return Math.round(def.base * level * doubling * starMultiplier(s));
}

export function upgradeCost(s: GameState, i: number): number {
  const def = WINTER_FLOORS[i];
  return Math.ceil(def.cost * def.growth ** (s.winter.floors[i].level - 1));
}

/** Next level that doubles the output. */
export function nextDoubling(level: number): number {
  return (Math.floor(level / WINTER_MILESTONE) + 1) * WINTER_MILESTONE;
}

/** Zimtsterne per second of all built floors if they ran without pause. */
export function starsPerSecond(s: GameState, autoOnly = false): number {
  let sum = 0;
  s.winter.floors.forEach((f, i) => {
    if (!f.built || (autoOnly && !floorAuto(s, i))) return;
    sum += batchStars(s, i) / WINTER_FLOORS[i].cycle;
  });
  return sum;
}

export type WinterTap = 'started' | 'boosted' | 'nothing';

/** Tap on a floor card: starts a batch, or speeds up the running one. */
export function tapWinterFloor(s: GameState, i: number, p: AdventPhase): WinterTap {
  const f = s.winter.floors[i];
  if (!eventRunning(p) || !f?.built) return 'nothing';
  if (!f.running) {
    f.running = true;
    f.progress = 0;
    return 'started';
  }
  f.progress = Math.min(0.999, f.progress + BALANCE.tap.boost * 1.5);
  return 'boosted';
}

export interface WinterTick {
  stars: number;
  /** Batches finished per floor. */
  batches: number[];
}

/** Advances the Lebkuchen-Manufaktur by `seconds`. */
export function advanceWinter(s: GameState, seconds: number): WinterTick {
  const out: WinterTick = { stars: 0, batches: [0, 0, 0] };
  if (seconds <= 0) return out;
  s.winter.floors.forEach((f, i) => {
    if (!f.built) return;
    const auto = floorAuto(s, i);
    if (!f.running) {
      if (!auto) return;
      f.running = true;
    }
    f.progress += seconds / WINTER_FLOORS[i].cycle;
    if (f.progress < 1) return;
    let n: number;
    if (auto) {
      n = Math.floor(f.progress);
      f.progress -= n;
    } else {
      n = 1;
      f.progress = 0;
      f.running = false;
    }
    const gained = n * batchStars(s, i);
    out.batches[i] = n;
    out.stars += gained;
  });
  s.winter.stars += out.stars;
  s.winter.earned += out.stars;
  return out;
}

export function upgradeWinterFloor(s: GameState, i: number, p: AdventPhase): boolean {
  const f = s.winter.floors[i];
  if (!eventRunning(p) || !f?.built) return false;
  const cost = upgradeCost(s, i);
  if (s.winter.stars < cost) return false;
  s.winter.stars -= cost;
  f.level += 1;
  return true;
}

export function buildWinterFloor(s: GameState, i: number, p: AdventPhase): boolean {
  const f = s.winter.floors[i];
  if (!eventRunning(p) || !f || f.built || !floorAvailable(s, i)) return false;
  const cost = WINTER_FLOORS[i].build;
  if (s.winter.stars < cost) return false;
  s.winter.stars -= cost;
  f.built = true;
  return true;
}

/** Hours the Lebkuchen-Manufaktur keeps working while the game is closed. */
export function winterOfflineHours(s: GameState): number {
  return hasPerk(s, 'offline') ? WINTER_OFFLINE_HOURS_PERK : WINTER_OFFLINE_HOURS;
}

/**
 * Credits the time between two wall clocks (an absence). Only the part that
 * lies inside the season counts, capped by the event's offline hours.
 */
export function creditWinterAbsence(s: GameState, from: number, to: number): WinterTick {
  const empty: WinterTick = { stars: 0, batches: [0, 0, 0] };
  if (!s.winter.season) return empty;
  const end = Math.min(to, seasonEnd(s.winter.season));
  const seconds = Math.min(Math.max(0, end - from) / 1000, winterOfflineHours(s) * 3600);
  return seconds > 0 ? advanceWinter(s, seconds) : empty;
}

/* ------------------------------------------------------------------------- */
/* Advent calendar                                                             */
/* ------------------------------------------------------------------------- */

export type DoorState = 'locked' | 'available' | 'open' | 'claimed';

export function doorState(s: GameState, day: number, p: AdventPhase): DoorState {
  if (s.winter.claimed.includes(day)) return 'claimed';
  if (s.winter.opened.includes(day)) return p.kind === 'active' ? 'open' : 'locked';
  if (p.kind === 'active' && day <= p.day) return 'available';
  return 'locked';
}

/** Doors waiting for a tap (badge on the event button). */
export function doorsWaiting(s: GameState, p: AdventPhase): number {
  if (p.kind !== 'active' || s.winter.season !== p.season) return 0;
  let n = 0;
  for (let d = 1; d <= Math.min(p.day, LAST_DOOR); d++) if (!s.winter.claimed.includes(d)) n++;
  return n;
}

export function openDoor(s: GameState, day: number, p: AdventPhase): boolean {
  if (doorState(s, day, p) !== 'available') return false;
  s.winter.opened.push(day);
  return true;
}

export interface DoorPayout {
  rewards: DoorReward[];
  manager: Manager | null;
}

/** Collects an opened door's rewards. */
export function claimDoor(s: GameState, day: number, p: AdventPhase): DoorPayout | null {
  if (doorState(s, day, p) !== 'open') return null;
  const d = DOOR_BY_DAY.get(day);
  if (!d) return null;
  s.winter.claimed.push(day);
  let manager: Manager | null = null;
  for (const r of d.rewards) {
    const m = applyReward(s, r);
    if (m) manager = m;
  }
  return { rewards: d.rewards, manager };
}

function applyReward(s: GameState, r: DoorReward): Manager | null {
  switch (r.kind) {
    case 'stars':
      s.winter.stars += r.amount;
      s.winter.earned += r.amount;
      return null;
    case 'recipePoints':
    case 'managerHireCredit':
    case 'goldenBean':
      grantReward(s, r);
      return null;
    case 'weihnachtsmanager':
      return grantWinterManager(s);
    default:
      return null; // perks and decoration are read from the collected doors
  }
}

export function isWinterManager(m: Pick<Manager, 'name'>): boolean {
  return m.name === WINTER_MANAGER_NAME;
}

/**
 * Nikolaus Lebkuchner joins the cocoa factory as a legendary floor manager
 * with a yield bonus. Who already has him gets a free hire instead.
 */
export function grantWinterManager(s: GameState): Manager | null {
  if (s.managers.some(isWinterManager)) {
    s.rewards.freeHires += 1;
    return null;
  }
  const m: Manager = {
    id: `m${s.nextManagerId++}`,
    name: WINTER_MANAGER_NAME,
    category: 'floor',
    rarity: BALANCE.managers.rarities.length - 1,
    bonus: 'yield',
    look: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    assignedTo: null,
    home: null,
    skillActive: 0,
    skillCooldown: 0,
  };
  s.managers.push(m);
  s.stats.managersHired += 1;
  return m;
}

/* ------------------------------------------------------------------------- */
/* Wintermarkt                                                                 */
/* ------------------------------------------------------------------------- */

export function marketOpen(s: GameState, p: AdventPhase): boolean {
  return p.kind === 'active' && hasPerk(s, 'markt');
}

export function shopBought(s: GameState, id: ShopItem['id']): number {
  return s.winter.shop[id] ?? 0;
}

/** Price of the next purchase. */
export function shopPrice(s: GameState, item: ShopItem): number {
  return Math.round(item.price * item.growth ** shopBought(s, item.id));
}

export type ShopStock = 'available' | 'today' | 'soldOut' | 'closed';

/** Each item once per December day, up to its total. */
export function shopStock(s: GameState, item: ShopItem, p: AdventPhase): ShopStock {
  if (shopBought(s, item.id) >= item.max) return 'soldOut';
  if (!marketOpen(s, p)) return 'closed';
  if (p.kind === 'active' && s.winter.shopDay[item.id] === p.day) return 'today';
  return 'available';
}

export function buyShopItem(s: GameState, id: ShopItem['id'], p: AdventPhase): ShopItem | null {
  const item = SHOP.find((x) => x.id === id);
  if (!item || p.kind !== 'active' || shopStock(s, item, p) !== 'available') return null;
  const price = shopPrice(s, item);
  if (s.winter.stars < price) return null;
  s.winter.stars -= price;
  s.winter.shop[id] = shopBought(s, id) + 1;
  s.winter.shopDay[id] = p.day;
  applyReward(s, item.reward);
  return item;
}

/* ------------------------------------------------------------------------- */
/* Daily goals in December                                                     */
/* ------------------------------------------------------------------------- */

/** Extra Zimtsterne per collected daily goal (door 13, until the event ends). */
export function dailyGoalStars(s: GameState, p: AdventPhase): number {
  if (p.kind !== 'active' || s.winter.season !== p.season || !hasPerk(s, 'tagesziele')) return 0;
  return Math.max(150, Math.round((starsPerSecond(s) * 600) / 50) * 50);
}

export function rewardLabel(r: DoorReward): string {
  switch (r.kind) {
    case 'stars':
      return `${r.amount.toLocaleString('de-DE')} Zimtsterne`;
    case 'recipePoints':
      return `${r.amount} Rezeptpunkte`;
    case 'goldenBean':
      return r.amount === 1 ? 'Goldene Bohne' : `${r.amount} Goldene Bohnen`;
    case 'managerHireCredit':
      return r.amount === 1 ? 'Manager kostenlos' : `${r.amount} Manager kostenlos`;
    case 'weihnachtsmanager':
      return WINTER_MANAGER_NAME;
    case 'perk':
      return PERK_LABEL[r.perk];
    case 'decor':
      return 'Winterdeko';
  }
}

const PERK_LABEL: Record<Perk, string> = {
  markt: 'Wintermarkt',
  auto0: 'Bäckerei automatisch',
  auto1: 'Werkstatt automatisch',
  auto2: 'Atelier automatisch',
  floor1: 'Neue Etage',
  floor2: 'Neue Etage',
  mehr25: '+25 % Zimtsterne',
  mehr50: '+50 % Zimtsterne',
  offline: 'Offline bis 8 h',
  tagesziele: 'Sterne für Tagesziele',
};
