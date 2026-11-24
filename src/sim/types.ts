import type { Decimal } from '../core/num';
import type { Notation } from '../core/format';

export type FloorStationId = 'f0' | 'f1' | 'f2' | 'f3' | 'f4';
export type StationId = FloorStationId | 'lift' | 'ship';
export type ManagerCategory = 'floor' | 'lift' | 'ship';
export type ManagerBonus = 'speed' | 'yield' | 'cost' | 'capacity' | 'price';
export type BuyMode = 1 | 10 | 25 | 100 | 'max';

export interface ManagerLook {
  skin: number;
  hair: number;
  hairColor: number;
  accessory: number;
}

export interface Manager {
  id: string;
  name: string;
  category: ManagerCategory;
  /** Index into BALANCE.managers.rarities. */
  rarity: number;
  bonus: ManagerBonus;
  look: ManagerLook;
  assignedTo: StationId | null;
  /** Seconds the active skill is still running. */
  skillActive: number;
  /** Seconds until the skill can be used again. */
  skillCooldown: number;
}

export interface FloorState {
  unlocked: boolean;
  level: number;
  /** 0..1 progress of the current cycle. */
  progress: number;
  running: boolean;
  /** Goods value waiting in the intermediate storage. */
  buffer: Decimal;
  managerId: string | null;
  stalled: boolean;
  tapBudget: number;
}

export type LiftPhase = 'idle' | 'up' | 'stop' | 'down' | 'unload';

export interface LiftState {
  level: number;
  managerId: string | null;
  phase: LiftPhase;
  /** Vertical position in floors: 0 = ground, 1 = first production floor. */
  pos: number;
  timer: number;
  cargo: Decimal;
  /** A tap asked for a dispatch (manual mode). */
  request: boolean;
  /** Depot was full while unloading. */
  blocked: boolean;
  tapBudget: number;
}

export type VanPhase = 'dock' | 'out' | 'back';

export interface VanState {
  phase: VanPhase;
  timer: number;
  cargo: Decimal;
}

export interface ShipState {
  level: number;
  managerId: string | null;
  vans: VanState[];
  /** Goods value waiting in the Versandlager. */
  depot: Decimal;
  sinceDispatch: number;
  request: boolean;
  tapBudget: number;
}

export type BoostKind = 'rush' | 'express';

export interface Boost {
  kind: BoostKind;
  factor: number;
  remaining: number;
  total: number;
}

export interface GoldenState {
  nextIn: number;
  active: { remaining: number; seed: number } | null;
}

export interface Stats {
  totalEarned: Decimal;
  batches: number;
  liftTrips: number;
  vanTrips: number;
  taps: number;
  goldenCaught: number;
  skillsUsed: number;
  managersHired: number;
  playSeconds: number;
  offlineSeconds: number;
}

export interface Settings {
  notation: Notation;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  buyMode: BuyMode;
}

export interface GameState {
  /** Save schema version (see save/migrations.ts). */
  version: number;
  createdAt: number;
  /** Wall clock (ms) up to which the simulation has been advanced. */
  lastWallTime: number;
  simTime: number;
  money: Decimal;
  floors: FloorState[];
  lift: LiftState;
  ship: ShipState;
  managers: Manager[];
  hires: Record<ManagerCategory, number>;
  nextManagerId: number;
  boosts: Boost[];
  golden: GoldenState;
  stats: Stats;
  quest: { index: number };
  rng: number;
  settings: Settings;
}

export type SimEvent =
  | { type: 'batch'; floor: number; value: Decimal }
  | { type: 'liftLoad'; floor: number; value: Decimal }
  | { type: 'liftUnload'; value: Decimal }
  | { type: 'vanDepart'; van: number; value: Decimal }
  | { type: 'sale'; van: number; value: Decimal }
  | { type: 'goldenSpawn' }
  | { type: 'goldenExpire' }
  | { type: 'boostEnd'; kind: BoostKind }
  | { type: 'skillEnd'; managerId: string };

export interface SimContext {
  /** Collects events for visuals; null when running headless/offline. */
  events: SimEvent[] | null;
  /** Offline catch-up: no golden beans, no taps. */
  offline: boolean;
  /** Optional accounting used for the offline report. */
  report?: OfflineAccumulator;
}

export interface OfflineAccumulator {
  earned: Decimal;
  produced: Decimal;
  floorStallSeconds: number[];
  liftBlockedSeconds: number;
  liftIdleSeconds: number;
  vansIdleSeconds: number;
}
