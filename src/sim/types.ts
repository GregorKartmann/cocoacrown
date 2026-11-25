import type { Decimal } from '../core/num';
import type { ResearchId } from '../config/research';
import type { Notation } from '../core/format';

export type FloorStationId = 'f0' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7';
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
  /** Station the manager worked at before the last brand sale; rejoins it when it is rebuilt. */
  home: StationId | null;
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
  /** Seconds of extra running time earned by taps, paid out smoothly. */
  rush: number;
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
  /** Seconds of extra running time earned by taps, paid out smoothly. */
  rush: number;
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
  /** Seconds of extra running time earned by taps, paid out smoothly. */
  rush: number;
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
  /** Lifetime records for achievements (kept through the brand sale). */
  maxFloorLevel: number;
  maxFloors: number;
}

export interface PrestigeState {
  /** Crowns owned; each adds BALANCE.prestige.perCrown to income, forever. */
  crowns: number;
  /** Number of brand sales so far. */
  runs: number;
  /** Lifetime earnings and play time when the current run started. */
  runStartEarned: Decimal;
  runStartPlay: number;
  /** Fastest time (s) from a run start to the 5th floor, if reached. */
  bestFloor5: number | null;
}

export interface ResearchState {
  /** Unspent Rezeptpunkte. */
  points: number;
  /** Rezeptpunkte earned in total (statistics). */
  earned: number;
  ranks: Record<ResearchId, number>;
  /** The one research in progress (seconds left of its total). */
  active: { id: ResearchId; remaining: number; total: number } | null;
  /** The lab opened (3rd floor built once); stays open after a brand sale. */
  open: boolean;
}

export interface DailyGoalState {
  id: string;
  target: number;
  progress: number;
  claimed: boolean;
}

export interface DailyState {
  /** IANA time zone saved when the game started; days change at local midnight there. */
  tz: string;
  /** Calendar day (YYYY-MM-DD) of the current offer, '' before the first one. */
  day: string;
  goals: DailyGoalState[];
  /** Goal ids of the previous offer (not repeated the next day when possible). */
  prevIds: string[];
  /** Per-day sets for the "distinct" goals. */
  floorsDone: number[];
  stationsTapped: string[];
  /** Days in a row with all three goals done; last such day. */
  streak: number;
  lastCompleteDay: string;
  /** The 3-day reward of the current streak was given. */
  streakHireGiven: boolean;
}

export interface WinterFloorState {
  built: boolean;
  level: number;
  /** 0..1 progress of the current batch. */
  progress: number;
  running: boolean;
}

/** Advent-Event „Lebkuchen-Manufaktur“ of one season (see sim/winter.ts). */
export interface WinterState {
  /** Year of the season this state belongs to (0 = never played). */
  season: number;
  /** Zimtsterne to spend, and earned in this season. */
  stars: number;
  earned: number;
  floors: WinterFloorState[];
  /** Advent doors opened, and collected (perks and decoration follow from these). */
  opened: number[];
  claimed: number[];
  /** Wintermarkt purchases per item, and the December day of the last one. */
  shop: Record<string, number>;
  shopDay: Record<string, number>;
}

export interface Settings {
  notation: Notation;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  buyMode: BuyMode;
  /** Winter decoration in the tower during December. */
  winterDecor: boolean;
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
  prestige: PrestigeState;
  research: ResearchState;
  /** Achievements whose reward was claimed. */
  goals: { claimed: string[] };
  /** Rewards waiting to be used: free manager hires and redeemable golden beans. */
  rewards: { freeHires: number; goldenBeans: number };
  daily: DailyState;
  winter: WinterState;
  rng: number;
  settings: Settings;
}

export type SimEvent =
  | { type: 'batch'; floor: number; value: Decimal }
  | { type: 'brandSold'; crowns: number }
  | { type: 'researchDone'; id: ResearchId; rank: number }
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
  researchDone: ResearchId[];
}
