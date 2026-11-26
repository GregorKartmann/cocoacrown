/**
 * Cocoa Crown – Balancing-Konfiguration.
 *
 * Every number that shapes the economy lives here. The simulation reads it but
 * never hard-codes values, so the model can be tuned (or A/B-tested later)
 * without touching game logic. Units: seconds, euro (goods value), levels.
 */

export type MilestoneEffect = 'yield' | 'speed';

export interface Milestone {
  level: number;
  effect: MilestoneEffect;
  factor: number;
  /** Visual: an additional worker appears from this level on. */
  worker?: boolean;
  /** Visual: the machine switches to the next build tier. */
  tier?: boolean;
}

export interface FloorDef {
  id: string;
  /** Product name (singular / plural) and machine shown in UI. */
  product: string;
  productPlural: string;
  machine: string;
  /** Euro value of one unit. */
  unitValue: number;
  /** Units produced per cycle at level 1 (scales linearly with level). */
  baseUnits: number;
  /** Seconds per production cycle at level 1. */
  baseCycle: number;
  unlockCost: number;
  /** Cost of the upgrade from level 1 to 2. */
  baseCost: number;
  /**
   * Floors 6–10 come with a bigger lift cabin and bigger vans: lift and van
   * capacity are multiplied by this once the floor stands (the "Oberhaus").
   * 0.8.1: ×8 instead of ×3 – each of these floors is worth ×20 per unit,
   * and with ×3 the lift could never catch up with all eight floors.
   */
  logistics?: number;
  costGrowth: number;
  /** Crowns the player must own (spent ones count) before this floor can be built. */
  crowns?: number;
}

export interface LogisticsMilestone {
  level: number;
  capacity?: number;
  speed?: number;
  /** Shipping only: adds a van. Lift: visual tier. */
  vehicle?: boolean;
  tier?: boolean;
}

export const BALANCE = {
  /** Fixed simulation step (s). Rendering never drives the economy. */
  dt: 0.05,
  startMoney: 0,

  offline: {
    /** Maximum credited absence in seconds (3 h in the vertical slice). */
    maxSeconds: 3 * 60 * 60,
    /** Upper bound for simulation steps during catch-up (adaptive step size). */
    maxSteps: 20000,
    /** Absences shorter than this are simulated silently without a report. */
    reportThresholdSeconds: 45,
  },

  floor: {
    /** Intermediate storage holds this many batches. */
    bufferBatches: 25,
    /** Cycles never get faster than this; extra speed turns into yield. */
    minCycle: 0.5,
    maxLevel: 1000,
  },

  floors: [
    { id: 'nibs', product: 'Röstnibs-Tüte', productPlural: 'Röstnibs-Tüten', machine: 'Trommelröster', unitValue: 1, baseUnits: 3, baseCycle: 3, unlockCost: 0, baseCost: 5, costGrowth: 1.15 },
    { id: 'cocoa', product: 'Trinkkakao-Dose', productPlural: 'Trinkkakao-Dosen', machine: 'Conche', unitValue: 25, baseUnits: 3, baseCycle: 4, unlockCost: 15000, baseCost: 2500, costGrowth: 1.15 },
    { id: 'bars', product: 'Schokoladentafel', productPlural: 'Schokoladentafeln', machine: 'Gießanlage', unitValue: 500, baseUnits: 3, baseCycle: 5, unlockCost: 250000, baseCost: 100000, costGrowth: 1.15 },
    { id: 'pralines', product: 'Pralinenschachtel', productPlural: 'Pralinenschachteln', machine: 'Überziehmaschine', unitValue: 10000, baseUnits: 3, baseCycle: 6, unlockCost: 5000000, baseCost: 2000000, costGrowth: 1.15 },
    { id: 'truffles', product: 'Trüffelbox', productPlural: 'Trüffelboxen', machine: 'Trüffel-Atelier', unitValue: 200000, baseUnits: 3, baseCycle: 8, unlockCost: 100000000, baseCost: 40000000, costGrowth: 1.15 },
    { id: 'nougat', product: 'Haselnuss-Nougat', productPlural: 'Haselnuss-Nougats', machine: 'Nougat-Mélangeur', unitValue: 4e6, baseUnits: 3, baseCycle: 9, unlockCost: 3e9, baseCost: 3e8, costGrowth: 1.18, logistics: 8 },
    { id: 'ruby', product: 'Ruby-Tafel', productPlural: 'Ruby-Tafeln', machine: 'Ruby-Temperieranlage', unitValue: 8e7, baseUnits: 3, baseCycle: 10, unlockCost: 3e11, baseCost: 8e9, costGrowth: 1.18, logistics: 8 },
    { id: 'signature', product: 'Signature-Box', productPlural: 'Signature-Boxen', machine: 'Geschenkbox-Presse', unitValue: 1.6e9, baseUnits: 3, baseCycle: 12, unlockCost: 3e13, baseCost: 3e11, costGrowth: 1.18, logistics: 8 },
    // 0.9.0: the art floors, built only with enough crowns (owned, spent ones count too)
    { id: 'sculptures', product: 'Schokoladen-Skulptur', productPlural: 'Schokoladen-Skulpturen', machine: 'Gießformen-Karussell', unitValue: 3.2e10, baseUnits: 3, baseCycle: 14, unlockCost: 1e15, baseCost: 3e14, costGrowth: 1.18, logistics: 8, crowns: 750 },
    { id: 'gallery', product: 'Schokoladenrelief', productPlural: 'Schokoladenreliefs', machine: 'Prägeanlage', unitValue: 6.4e11, baseUnits: 3, baseCycle: 16, unlockCost: 1e18, baseCost: 3e17, costGrowth: 1.18, logistics: 8, crowns: 2000 },
  ],

  floorMilestones: [
    { level: 10, effect: 'yield', factor: 2, worker: true },
    { level: 25, effect: 'speed', factor: 2, tier: true },
    { level: 50, effect: 'yield', factor: 2, worker: true },
    { level: 75, effect: 'yield', factor: 2 },
    { level: 100, effect: 'speed', factor: 2, worker: true, tier: true },
    { level: 150, effect: 'yield', factor: 2 },
    { level: 200, effect: 'yield', factor: 3 },
    { level: 250, effect: 'yield', factor: 2 },
    { level: 300, effect: 'yield', factor: 3 },
    { level: 400, effect: 'yield', factor: 3 },
    { level: 500, effect: 'yield', factor: 5 },
    { level: 750, effect: 'yield', factor: 5 },
    { level: 1000, effect: 'yield', factor: 10 },
  ],

  lift: {
    /** Goods value (€) the lift carries per trip at level 1. */
    baseCapacity: 12,
    /** Seconds to travel one floor at level 1. */
    floorTravel: 0.85,
    /** Seconds spent loading at a floor with goods. */
    dwell: 0.3,
    /** Seconds spent unloading on the ground floor. */
    unload: 0.5,
    baseCost: 18,
    costGrowth: 1.14,
    maxLevel: 1000,
    milestones: [
      { level: 10, capacity: 2 },
      { level: 20, capacity: 2 },
      { level: 25, speed: 1.5, tier: true },
      { level: 30, capacity: 2 },
      { level: 40, capacity: 2 },
      { level: 50, capacity: 2, speed: 1.33 },
      { level: 60, capacity: 2 },
      { level: 70, capacity: 2 },
      { level: 80, capacity: 2 },
      { level: 90, capacity: 2 },
      { level: 100, capacity: 2, speed: 1.5, tier: true },
      { level: 125, capacity: 3 },
      { level: 150, capacity: 3 },
      { level: 175, capacity: 3 },
      { level: 200, capacity: 3 },
      // 0.8.1: late levels pay off again (before: ×4 at 250/300, ×5 at 400/500)
      { level: 225, capacity: 3 },
      { level: 250, capacity: 3 },
      { level: 275, capacity: 3 },
      { level: 300, capacity: 3 },
      { level: 350, capacity: 3 },
      { level: 400, capacity: 3 },
      { level: 450, capacity: 3 },
      { level: 500, capacity: 3 },
    ],
    /** Versandlager holds this many full lift loads. */
    depotLoads: 25,
  },

  shipping: {
    /** Total goods value (€) all vans carry per round at level 1. */
    baseCapacity: 16,
    /** Seconds for one van round trip (load, drive, sell, return). */
    roundTrip: 6,
    baseCost: 22,
    costGrowth: 1.14,
    maxLevel: 1000,
    maxVans: 5,
    milestones: [
      { level: 10, capacity: 2, vehicle: true },
      { level: 20, capacity: 2 },
      { level: 25, speed: 1.5, vehicle: true },
      { level: 30, capacity: 2 },
      { level: 40, capacity: 2 },
      { level: 50, capacity: 2, vehicle: true },
      { level: 60, capacity: 2 },
      { level: 70, capacity: 2 },
      { level: 80, capacity: 2 },
      { level: 90, capacity: 2 },
      { level: 100, capacity: 2, speed: 1.5, vehicle: true },
      { level: 125, capacity: 3 },
      { level: 150, capacity: 3 },
      { level: 175, capacity: 3 },
      { level: 200, capacity: 3 },
      // 0.8.1: late levels pay off again (before: ×4 at 250/300, ×5 at 400/500)
      { level: 225, capacity: 3 },
      { level: 250, capacity: 3 },
      { level: 275, capacity: 3 },
      { level: 300, capacity: 3 },
      { level: 350, capacity: 3 },
      { level: 400, capacity: 3 },
      { level: 450, capacity: 3 },
      { level: 500, capacity: 3 },
    ],
  },

  managers: {
    hireBaseCost: { floor: 40, lift: 100, ship: 120 },
    hireCostGrowth: { floor: 5, lift: 6, ship: 6 },
    rarities: [
      { id: 'common', name: 'Gewöhnlich', weight: 60, passive: 0.1, costCut: 0.1, active: 2, duration: 30 },
      { id: 'rare', name: 'Selten', weight: 28, passive: 0.25, costCut: 0.2, active: 2.5, duration: 45 },
      { id: 'epic', name: 'Episch', weight: 10, passive: 0.5, costCut: 0.3, active: 3, duration: 60 },
      { id: 'legendary', name: 'Legendär', weight: 2, passive: 1.0, costCut: 0.4, active: 4, duration: 90 },
    ],
    skillCooldown: 300,
    /** While a cost skill is active, upgrades of the managed station cost this fraction. */
    costSkillFactor: 0.5,
  },

  prestige: {
    /**
     * Crowns from lifetime earnings: floor(sqrt(lifetime / divisor)) minus the
     * crowns already owned. The square root makes waiting longer worth less and
     * less, so "when do I sell?" stays a real decision.
     */
    divisor: 1e7,
    /**
     * From this many crowns on the root gets steeper (6th root instead of
     * square root): doubling the crowns then needs 64× the earnings instead
     * of 4×. Floors 6–10 multiply production by orders of magnitude, so a
     * flatter tail let crowns run into the thousands within three hours.
     * 0.8.0 used the cube root from 100, 0.8.1 the 4th root from 100, 0.9.0
     * the 6th root from 50 (fitted with tests/campaign.long.test.ts).
     * Sales count from the last sale's earnings, so changing this never
     * strands crowns already owned.
     */
    tailFrom: 50,
    tailRoot: 6,
    /** Income bonus per crown (+10 %, additive) … */
    perCrown: 0.1,
    /**
     * … for the first 100 crowns. Beyond that the bonus grows with the square
     * root (0.9.0): 400 crowns count like 200, 3.000 like 548. Without this a
     * few thousand crowns made money practically unlimited.
     */
    fullBonusUpTo: 100,
    /**
     * Estimate for the sale dialog: time to the 5th floor scales with
     * (crown factor)^-exponent. Fitted to the bot campaigns in
     * tests/prestige.test.ts (runs 2–4 land between 0.79 and 0.94).
     */
    estimateExponent: 0.8,
  },

  tap: {
    /** Progress earned per tap on a running cycle (fraction of a cycle or trip). */
    boost: 0.1,
    /** Effective taps per second and station; extra taps only give feedback. */
    maxPerSecond: 6,
    /**
     * Taps do not jump: the earned progress is paid out smoothly by running the
     * station up to this many times faster until the queued time is used up.
     */
    maxSpeed: 3,
    /** Queued tap time is capped at this fraction of a cycle or trip. */
    maxQueue: 0.6,
  },

  golden: {
    firstSpawn: 75,
    minInterval: 90,
    maxInterval: 210,
    lifetime: 10,
    rewards: [
      { id: 'cash', weight: 50, seconds: 30, minimum: 25 },
      { id: 'rush', weight: 30, factor: 2, duration: 45 },
      { id: 'express', weight: 20, factor: 3, duration: 30 },
    ],
  },
} as const;

export type Balance = typeof BALANCE;
export type RarityId = (typeof BALANCE.managers.rarities)[number]['id'];
export type GoldenRewardId = (typeof BALANCE.golden.rewards)[number]['id'];
