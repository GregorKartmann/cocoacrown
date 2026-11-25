import { BALANCE } from '../config/balance';
import { D } from '../core/num';
import { defaultDaily } from './goals';
import { defaultResearch } from './research';
import { randomSeed } from './rng';
import type { FloorState, GameState, LiftState, PrestigeState, Settings, ShipState } from './types';

/**
 * v2: prestige ("Marke verkaufen"), manager home stations, smooth tap time.
 * v3: floors 6–8, Rezeptlabor (research).
 * v4: Erfolge, Tagesziele mit Serie, Belohnungen (kostenlose Einstellung, Goldene Bohne).
 */
export const SAVE_VERSION = 4;

export function defaultSettings(): Settings {
  return { notation: 'short', sound: true, music: true, haptics: true, buyMode: 1 };
}

export function freshFloors(): FloorState[] {
  return BALANCE.floors.map((_, i) => ({
    unlocked: i === 0,
    level: 1,
    progress: 0,
    running: false,
    buffer: D(0),
    managerId: null,
    stalled: false,
    tapBudget: BALANCE.tap.maxPerSecond,
    rush: 0,
  }));
}

export function freshLift(): LiftState {
  return {
    level: 1,
    managerId: null,
    phase: 'idle',
    pos: 0,
    timer: 0,
    cargo: D(0),
    request: false,
    blocked: false,
    tapBudget: BALANCE.tap.maxPerSecond,
    rush: 0,
  };
}

export function freshShip(): ShipState {
  return {
    level: 1,
    managerId: null,
    vans: [{ phase: 'dock', timer: 0, cargo: D(0) }],
    depot: D(0),
    sinceDispatch: 999,
    request: false,
    tapBudget: BALANCE.tap.maxPerSecond,
    rush: 0,
  };
}

export function defaultPrestige(): PrestigeState {
  return { crowns: 0, runs: 0, runStartEarned: D(0), runStartPlay: 0, bestFloor5: null };
}

export function createGame(now = Date.now(), seed = randomSeed(), settings: Settings = defaultSettings()): GameState {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastWallTime: now,
    simTime: 0,
    money: D(BALANCE.startMoney),
    floors: freshFloors(),
    lift: freshLift(),
    ship: freshShip(),
    managers: [],
    hires: { floor: 0, lift: 0, ship: 0 },
    nextManagerId: 1,
    boosts: [],
    golden: { nextIn: BALANCE.golden.firstSpawn, active: null },
    stats: {
      totalEarned: D(0),
      batches: 0,
      liftTrips: 0,
      vanTrips: 0,
      taps: 0,
      goldenCaught: 0,
      skillsUsed: 0,
      managersHired: 0,
      playSeconds: 0,
      offlineSeconds: 0,
      maxFloorLevel: 1,
      maxFloors: 1,
    },
    quest: { index: 0 },
    prestige: defaultPrestige(),
    research: defaultResearch(),
    goals: { claimed: [] },
    rewards: { freeHires: 0, goldenBeans: 0 },
    daily: defaultDaily(),
    rng: seed >>> 0,
    settings: { ...settings },
  };
}
