/**
 * Erfolge (permanent achievements) and Tagesziele (daily goals), after the
 * content sheet of the "Cocoa Crown – Erfolge" pack (inhalte.json).
 *
 * Achievements read lifetime counters that survive the brand sale. Daily goals
 * count only active play since the start of the calendar day.
 */
import type { GameState } from '../sim/types';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'cup' | 'crown';

export type GoalReward = { kind: 'recipePoints'; amount: number } | { kind: 'managerHireCredit'; amount: number } | { kind: 'goldenBean'; amount: number };

export interface AchievementCategory {
  id: string;
  name: string;
  /** Category badge from the pack (abzeichen/alternativen). */
  badge: string;
}

export interface Achievement {
  id: string;
  category: string;
  /** Small symbol shown on the medal. */
  icon: string;
  badge: BadgeTier;
  title: string;
  target: number;
  value: (s: GameState) => number;
  reward: GoalReward;
}

export const BADGE_ART: Record<BadgeTier, string> = {
  bronze: 'abzeichen/medaille_bronze',
  silver: 'abzeichen/medaille_silber',
  gold: 'abzeichen/medaille_gold',
  cup: 'abzeichen/pokal_gold',
  crown: 'abzeichen/pokal_krone',
};

/** Existing game art reused as goal symbols (see "symbole/" in the pack). */
export const GOAL_ICON: Record<string, string> = {
  charges: 'forschung/symbole/chargengroesse',
  trucks: 'logistik/lieferwagen',
  lift: 'logistik/lastenaufzug',
  manager: 'oberflaeche/manager',
  skill: 'oberflaeche/boost',
  bean: 'produkte/goldene_kakaobohne',
  upgrade: 'oberflaeche/upgrade',
  clock: 'oberflaeche/offline',
  factory: 'oberflaeche/werk',
  prestige: 'oberflaeche/krone',
  checklist: 'oberflaeche/auftraege',
  crate: 'logistik/versandkisten',
  research: 'forschung/forschungsmarke',
  done: 'oberflaeche/bestaetigen',
  contract: 'vertraege/siegel/puenktlich',
};

export const CATEGORIES: AchievementCategory[] = [
  { id: 'Produktion', name: 'Produktion', badge: 'abzeichen/alternativen/produktion' },
  { id: 'Auslieferung', name: 'Auslieferung', badge: 'abzeichen/alternativen/lieferung' },
  { id: 'Aufzug', name: 'Aufzug', badge: 'abzeichen/alternativen/aufzug' },
  { id: 'Personal', name: 'Personal', badge: 'abzeichen/alternativen/manager' },
  { id: 'Manager-Fähigkeiten', name: 'Manager-Fähigkeiten', badge: 'abzeichen/alternativen/manager' },
  { id: 'Goldene Bohnen', name: 'Goldene Bohnen', badge: 'abzeichen/alternativen/kakaobohne' },
  { id: 'Maschinenausbau', name: 'Maschinenausbau', badge: 'abzeichen/alternativen/produktion' },
  { id: 'Offline-Fortschritt', name: 'Offline-Fortschritt', badge: 'abzeichen/alternativen/offline' },
  { id: 'Fabrikausbau', name: 'Fabrikausbau', badge: 'abzeichen/alternativen/fabrik' },
  { id: 'Prestige', name: 'Markenverkauf', badge: 'abzeichen/alternativen/marke' },
];

const rp = (amount: number): GoalReward => ({ kind: 'recipePoints', amount });
const hire: GoalReward = { kind: 'managerHireCredit', amount: 1 };
const bean: GoalReward = { kind: 'goldenBean', amount: 1 };

type Tier = [BadgeTier, number, GoalReward];
function series(id: string, category: string, icon: string, value: (s: GameState) => number, title: (n: string) => string, tiers: Tier[]): Achievement[] {
  return tiers.map(([badge, target, reward]) => ({
    id: `${id}_${target}`,
    category,
    icon,
    badge,
    title: title(target.toLocaleString('de-DE')),
    target,
    value,
    reward,
  }));
}

export const ACHIEVEMENTS: Achievement[] = [
  ...series('charges', 'Produktion', 'charges', (s) => s.stats.batches, (n) => `${n} Chargen herstellen`, [
    ['bronze', 10, rp(1)],
    ['silver', 250, rp(2)],
    ['gold', 2000, rp(3)],
  ]),
  ...series('trucks', 'Auslieferung', 'trucks', (s) => s.stats.vanTrips, (n) => `${n} Lieferfahrten abschließen`, [
    ['bronze', 10, rp(1)],
    ['silver', 100, rp(2)],
    ['gold', 500, rp(3)],
  ]),
  ...series('lift', 'Aufzug', 'lift', (s) => s.stats.liftTrips, (n) => `${n} Aufzugfahrten abschließen`, [
    ['bronze', 10, rp(1)],
    ['silver', 100, rp(2)],
    ['gold', 500, rp(3)],
  ]),
  { id: 'manager_1', category: 'Personal', icon: 'manager', badge: 'bronze', title: 'Ersten Manager einstellen', target: 1, value: (s) => s.stats.managersHired, reward: rp(1) },
  { id: 'manager_5', category: 'Personal', icon: 'manager', badge: 'silver', title: '5 Manager einstellen', target: 5, value: (s) => s.stats.managersHired, reward: hire },
  { id: 'manager_15', category: 'Personal', icon: 'manager', badge: 'gold', title: '15 Manager einstellen', target: 15, value: (s) => s.stats.managersHired, reward: hire },
  ...series('skill', 'Manager-Fähigkeiten', 'skill', (s) => s.stats.skillsUsed, (n) => `${n} Manager-Fähigkeiten auslösen`, [
    ['bronze', 5, rp(1)],
    ['silver', 25, rp(2)],
    ['gold', 100, rp(3)],
  ]),
  { id: 'bean_1', category: 'Goldene Bohnen', icon: 'bean', badge: 'bronze', title: 'Erste Goldene Bohne fangen', target: 1, value: (s) => s.stats.goldenCaught, reward: rp(1) },
  { id: 'bean_10', category: 'Goldene Bohnen', icon: 'bean', badge: 'silver', title: '10 Goldene Bohnen fangen', target: 10, value: (s) => s.stats.goldenCaught, reward: rp(2) },
  { id: 'bean_50', category: 'Goldene Bohnen', icon: 'bean', badge: 'gold', title: '50 Goldene Bohnen fangen', target: 50, value: (s) => s.stats.goldenCaught, reward: bean },
  ...series('upgrade', 'Maschinenausbau', 'upgrade', (s) => s.stats.maxFloorLevel, (n) => `Eine Maschine auf Level ${n} bringen`, [
    ['bronze', 10, rp(1)],
    ['silver', 50, rp(2)],
    ['gold', 100, rp(3)],
  ]),
  { id: 'clock_3600', category: 'Offline-Fortschritt', icon: 'clock', badge: 'bronze', title: '1 Stunde Offline-Fortschritt sammeln', target: 3600, value: (s) => s.stats.offlineSeconds, reward: rp(1) },
  { id: 'clock_18000', category: 'Offline-Fortschritt', icon: 'clock', badge: 'silver', title: '5 Stunden Offline-Fortschritt sammeln', target: 18000, value: (s) => s.stats.offlineSeconds, reward: rp(2) },
  { id: 'clock_86400', category: 'Offline-Fortschritt', icon: 'clock', badge: 'gold', title: '24 Stunden Offline-Fortschritt sammeln', target: 86400, value: (s) => s.stats.offlineSeconds, reward: rp(3) },
  { id: 'floor_5', category: 'Fabrikausbau', icon: 'factory', badge: 'cup', title: 'Etage 5 bauen', target: 5, value: (s) => s.stats.maxFloors, reward: rp(2) },
  { id: 'floor_6', category: 'Fabrikausbau', icon: 'factory', badge: 'cup', title: 'Etage 6 bauen', target: 6, value: (s) => s.stats.maxFloors, reward: rp(2) },
  { id: 'floor_7', category: 'Fabrikausbau', icon: 'factory', badge: 'cup', title: 'Etage 7 bauen', target: 7, value: (s) => s.stats.maxFloors, reward: rp(2) },
  { id: 'floor_8', category: 'Fabrikausbau', icon: 'factory', badge: 'crown', title: 'Etage 8 bauen', target: 8, value: (s) => s.stats.maxFloors, reward: bean },
  { id: 'floor_9', category: 'Fabrikausbau', icon: 'factory', badge: 'crown', title: 'Etage 9 bauen', target: 9, value: (s) => s.stats.maxFloors, reward: bean },
  { id: 'floor_10', category: 'Fabrikausbau', icon: 'factory', badge: 'crown', title: 'Etage 10 bauen', target: 10, value: (s) => s.stats.maxFloors, reward: bean },
  { id: 'prestige_1', category: 'Prestige', icon: 'prestige', badge: 'crown', title: 'Erste Marke verkaufen', target: 1, value: (s) => s.prestige.runs, reward: hire },
  { id: 'prestige_5', category: 'Prestige', icon: 'prestige', badge: 'crown', title: '5 Marken verkaufen', target: 5, value: (s) => s.prestige.runs, reward: bean },
];

/* ------------------------------------------------------------------------- */
/* Daily goals                                                                */
/* ------------------------------------------------------------------------- */

export type DailySlot = 'Produktion' | 'Logistik' | 'Extra';

export type DailyMetric =
  | 'activeBatches'
  | 'manualBatchStarts'
  | 'paidProductionLevels'
  | 'distinctActiveBatchFloors'
  | 'activeVanTrips'
  | 'activeLiftTrips'
  | 'activeValueShipped'
  | 'paidLogisticsLevels'
  | 'acceptedActionTaps'
  | 'activeSeconds'
  | 'activeManagerSkills'
  | 'distinctManualStations'
  | 'contractsDelivered';

export type DailyRequirement =
  | 'manual_production_possible'
  | 'affordable_production_upgrade_possible'
  | 'two_floors_unlocked'
  | 'affordable_logistics_upgrade_possible'
  | 'assigned_manager_present'
  | 'contracts_open';

export interface DailyTemplate {
  id: string;
  slot: DailySlot;
  /** Title; `{n}` is replaced by the (formatted) target. */
  title: string;
  metric: DailyMetric;
  /** Fixed target, or 'income600' = ten minutes of current income (at least 50 €). */
  target: number | 'income600';
  icon: string;
  requires: DailyRequirement[];
}

export const DAILY_SLOTS: DailySlot[] = ['Produktion', 'Logistik', 'Extra'];

export const DAILY_POOL: DailyTemplate[] = [
  { id: 'prod_batches', slot: 'Produktion', title: '{n} Chargen herstellen', metric: 'activeBatches', target: 10, icon: 'charges', requires: [] },
  { id: 'prod_manual', slot: 'Produktion', title: '{n} Chargen per Tippen starten', metric: 'manualBatchStarts', target: 6, icon: 'charges', requires: ['manual_production_possible'] },
  { id: 'prod_levels', slot: 'Produktion', title: '{n} Maschinenlevel kaufen', metric: 'paidProductionLevels', target: 3, icon: 'upgrade', requires: ['affordable_production_upgrade_possible'] },
  { id: 'prod_variety', slot: 'Produktion', title: 'Auf {n} Etagen je eine Charge fertigstellen', metric: 'distinctActiveBatchFloors', target: 2, icon: 'charges', requires: ['two_floors_unlocked'] },
  { id: 'ship_trips', slot: 'Logistik', title: '{n} Lieferfahrten abschließen', metric: 'activeVanTrips', target: 6, icon: 'trucks', requires: [] },
  { id: 'ship_lift', slot: 'Logistik', title: '{n} Aufzugfahrten abschließen', metric: 'activeLiftTrips', target: 5, icon: 'lift', requires: [] },
  // The pack's "18 Produkte ausliefern": logistics here is value-based, so the target is ten minutes of income.
  { id: 'ship_units', slot: 'Logistik', title: 'Ware für {n} ausliefern', metric: 'activeValueShipped', target: 'income600', icon: 'crate', requires: [] },
  { id: 'ship_levels', slot: 'Logistik', title: '{n} Aufzug- oder Versandlevel kaufen', metric: 'paidLogisticsLevels', target: 2, icon: 'upgrade', requires: ['affordable_logistics_upgrade_possible'] },
  { id: 'flex_taps', slot: 'Extra', title: '{n} Aktionen per Tippen auslösen', metric: 'acceptedActionTaps', target: 25, icon: 'checklist', requires: [] },
  { id: 'flex_focus', slot: 'Extra', title: '3 Minuten aktiv spielen', metric: 'activeSeconds', target: 180, icon: 'clock', requires: [] },
  { id: 'flex_skill', slot: 'Extra', title: 'Eine Manager-Fähigkeit aktivieren', metric: 'activeManagerSkills', target: 1, icon: 'skill', requires: ['assigned_manager_present'] },
  { id: 'flex_contract', slot: 'Extra', title: 'Einen Liefervertrag pünktlich erfüllen', metric: 'contractsDelivered', target: 1, icon: 'contract', requires: ['contracts_open'] },
  { id: 'flex_stations', slot: 'Extra', title: '{n} verschiedene Stationen von Hand bedienen', metric: 'distinctManualStations', target: 2, icon: 'checklist', requires: [] },
];

export const DAILY_BY_ID: Record<string, DailyTemplate> = Object.fromEntries(DAILY_POOL.map((t) => [t.id, t]));

/** Each completed daily goal. */
export const DAILY_REWARD: GoalReward = { kind: 'recipePoints', amount: 2 };

/** Streak milestones: 3 days once per streak, every 7th day again. */
export const STREAK = {
  hireAt: 3,
  beanEvery: 7,
};

/** Streak flame art by length. */
export function streakBadge(days: number): string {
  if (days >= 30) return 'abzeichen/alternativen/serie_lang';
  if (days >= 7) return 'abzeichen/alternativen/serie_woche';
  if (days >= 1) return 'abzeichen/alternativen/serie_kurz';
  return 'abzeichen/serienflamme';
}
