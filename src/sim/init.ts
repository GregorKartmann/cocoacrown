import { BALANCE } from '../config/balance';
import { D } from '../core/num';
import { randomSeed } from './rng';
import type { GameState, Settings } from './types';

export const SAVE_VERSION = 1;

export function defaultSettings(): Settings {
  return { notation: 'short', sound: true, music: true, haptics: true, buyMode: 1 };
}

export function createGame(now = Date.now(), seed = randomSeed(), settings: Settings = defaultSettings()): GameState {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastWallTime: now,
    simTime: 0,
    money: D(BALANCE.startMoney),
    floors: BALANCE.floors.map((_, i) => ({
      unlocked: i === 0,
      level: 1,
      progress: 0,
      running: false,
      buffer: D(0),
      managerId: null,
      stalled: false,
      tapBudget: BALANCE.tap.maxPerSecond,
    })),
    lift: {
      level: 1,
      managerId: null,
      phase: 'idle',
      pos: 0,
      timer: 0,
      cargo: D(0),
      request: false,
      blocked: false,
      tapBudget: BALANCE.tap.maxPerSecond,
    },
    ship: {
      level: 1,
      managerId: null,
      vans: [{ phase: 'dock', timer: 0, cargo: D(0) }],
      depot: D(0),
      sinceDispatch: 999,
      request: false,
      tapBudget: BALANCE.tap.maxPerSecond,
    },
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
    },
    quest: { index: 0 },
    rng: seed >>> 0,
    settings: { ...settings },
  };
}
