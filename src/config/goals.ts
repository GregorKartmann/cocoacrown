/**
 * Erfolge (permanent achievements) and Tagesziele (daily goals), after the
 * content sheet of the "Cocoa Crown – Erfolge" pack (inhalte.json).
 *
 * Achievements read lifetime counters that survive the brand sale. Daily goals
 * count only active play since the start of the calendar day.
 */
import type { GameState } from '../sim/types';
import { CUSTOMERS } from './contracts';
import { BRANCHES, RESEARCH } from './research';
import { TREASURY } from './treasury';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platin' | 'diamant' | 'cup' | 'crown';

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
  /** Tiers of one series share this key; the list shows the next open tier. */
  series?: string;
  /** How progress is printed (default: a count). */
  unit?: 'count' | 'time' | 'money' | 'rate';
  /** Replaces the progress text (e.g. best times, where less is better). */
  text?: (s: GameState) => string;
  /** Second line under the title. */
  hint?: string;
}

export const BADGE_ART: Record<BadgeTier, string> = {
  bronze: 'abzeichen/medaille_bronze',
  silver: 'abzeichen/medaille_silber',
  gold: 'abzeichen/medaille_gold',
  platin: 'abzeichen/medaille_platin',
  diamant: 'abzeichen/medaille_diamant',
  cup: 'abzeichen/pokal_gold',
  crown: 'abzeichen/pokal_krone',
};

export const BADGE_NAME: Record<BadgeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silber',
  gold: 'Gold',
  platin: 'Platin',
  diamant: 'Diamant',
  cup: 'Pokal',
  crown: 'Kronen-Pokal',
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
  together: 'forschung/symbole/produktion',
  oberhaus: 'forschung/symbole/meisterrezept',
  winch: 'logistik/winde',
  coin: 'oberflaeche/muenze',
  stats: 'oberflaeche/statistik',
  flow: 'forschung/symbole/routenplanung',
  crowns: 'schatzkammer/symbole/kronen',
  sale: 'forschung/symbole/markensiegel',
  speed: 'forschung/symbole/schnellere_zyklen',
  treasury: 'schatzkammer/symbole/schatzkammer',
  ruf: 'vertraege/symbole/ruf',
  deadline: 'vertraege/symbole/frist',
  lab: 'forschung/symbole/rezeptentwicklung',
};

export const CATEGORIES: AchievementCategory[] = [
  { id: 'Produktion', name: 'Produktion', badge: 'abzeichen/alternativen/produktion' },
  { id: 'Maschinenausbau', name: 'Maschinenausbau', badge: 'abzeichen/alternativen/produktion' },
  { id: 'Fabrikausbau', name: 'Fabrikausbau', badge: 'abzeichen/alternativen/fabrik' },
  { id: 'Aufzug', name: 'Aufzug', badge: 'abzeichen/alternativen/aufzug' },
  { id: 'Auslieferung', name: 'Auslieferung', badge: 'abzeichen/alternativen/lieferung' },
  { id: 'Wirtschaft', name: 'Wirtschaft', badge: 'oberflaeche/muenze' },
  { id: 'Personal', name: 'Personal', badge: 'abzeichen/alternativen/manager' },
  { id: 'Manager-Fähigkeiten', name: 'Manager-Fähigkeiten', badge: 'abzeichen/alternativen/manager' },
  { id: 'Goldene Bohnen', name: 'Goldene Bohnen', badge: 'abzeichen/alternativen/kakaobohne' },
  { id: 'Lieferverträge', name: 'Lieferverträge', badge: 'vertraege/siegel/puenktlich' },
  { id: 'Rezeptlabor', name: 'Rezeptlabor', badge: 'abzeichen/alternativen/forschung' },
  { id: 'Offline-Fortschritt', name: 'Offline-Fortschritt', badge: 'abzeichen/alternativen/offline' },
  { id: 'Prestige', name: 'Markenverkauf', badge: 'abzeichen/alternativen/marke' },
];

const rp = (amount: number): GoalReward => ({ kind: 'recipePoints', amount });
const hire: GoalReward = { kind: 'managerHireCredit', amount: 1 };
const bean: GoalReward = { kind: 'goldenBean', amount: 1 };
const beans = (amount: number): GoalReward => ({ kind: 'goldenBean', amount });

/** The usual rewards per medal: Platin 5 Rezeptpunkte, Diamant 2 Goldene Bohnen. */
const PLATIN = rp(5);
const DIAMANT = beans(2);

type Tier = [BadgeTier, number, GoalReward];
type SeriesOpts = Pick<Achievement, 'unit' | 'hint'>;
function series(
  id: string,
  category: string,
  icon: string,
  value: (s: GameState) => number,
  title: (n: string, target: number) => string,
  tiers: Tier[],
  opts: SeriesOpts = {},
): Achievement[] {
  return tiers.map(([badge, target, reward]) => ({
    id: `${id}_${target}`,
    category,
    icon,
    badge,
    title: title(target.toLocaleString('de-DE'), target),
    target,
    value,
    reward,
    series: id,
    ...opts,
  }));
}

const levelRank = (k: number) => (s: GameState) => s.stats.records.levelRank[k - 1] ?? 0;
const floorBest = (i: number) => (s: GameState) => s.stats.records.floorBest[i] ?? 0;
const MONEY_WORDS: Record<number, string> = { 1e6: '1 Mio.', 1e9: '1 Mrd.', 1e12: '1 Bio.', 1e15: '1 Brd.', 1e18: '1 Trio.', 1e21: '1 Trd.' };
const money = (v: number) => MONEY_WORDS[v] ?? v.toExponential(0);
const minutes = (sec: number) => (sec % 60 === 0 ? `${sec / 60} ${sec === 60 ? 'Minute' : 'Minuten'}` : `${sec} Sekunden`);

/** Research ranks finished, per branch and in total. */
function researchDone(s: GameState): { branches: number; ranks: number } {
  let branches = 0;
  let ranks = 0;
  for (const b of BRANCHES) {
    const nodes = RESEARCH.filter((n) => n.branch === b.id);
    if (nodes.every((n) => (s.research.ranks[n.id] ?? 0) >= n.maxRank)) branches++;
  }
  for (const n of RESEARCH) ranks += Math.min(n.maxRank, s.research.ranks[n.id] ?? 0);
  return { branches, ranks };
}
export const RESEARCH_RANKS = RESEARCH.reduce((a, n) => a + n.maxRank, 0);
export const TREASURY_RANKS = TREASURY.reduce((a, t) => a + t.costs.length, 0);
const treasuryBought = (s: GameState) => TREASURY.reduce((a, t) => a + Math.min(t.costs.length, s.prestige.treasury[t.id] ?? 0), 0);

/** Brand sale to the 8th floor: best time, shown as "Bestzeit 12:34". */
function floor8Text(s: GameState): string {
  const t = s.stats.records.bestFloor8;
  if (t === null) return 'Noch keine Zeit';
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `Bestzeit ${m}:${String(sec).padStart(2, '0')} min`;
}
const BLITZ: Tier[] = [
  ['bronze', 60, rp(1)],
  ['silver', 30, rp(2)],
  ['gold', 15, rp(3)],
  ['platin', 8, PLATIN],
  ['diamant', 4, DIAMANT],
];

export const ACHIEVEMENTS: Achievement[] = [
  /* Produktion */
  ...series('charges', 'Produktion', 'charges', (s) => s.stats.batches, (n) => `${n} Chargen herstellen`, [
    ['bronze', 10, rp(1)],
    ['silver', 250, rp(2)],
    ['gold', 2000, rp(3)],
    ['platin', 100000, PLATIN],
    ['diamant', 1000000, DIAMANT],
  ]),

  /* Maschinenausbau */
  ...series('upgrade', 'Maschinenausbau', 'upgrade', (s) => s.stats.maxFloorLevel, (n) => `Eine Maschine auf Level ${n} bringen`, [
    ['bronze', 10, rp(1)],
    ['silver', 50, rp(2)],
    ['gold', 100, rp(3)],
    ['platin', 200, PLATIN],
    ['diamant', 250, DIAMANT],
  ]),
  { id: 'together_5x50', series: 'together', category: 'Maschinenausbau', icon: 'together', badge: 'bronze', title: '5 Etagen gleichzeitig auf Level 50', target: 50, value: levelRank(5), reward: rp(2) },
  { id: 'together_8x50', series: 'together', category: 'Maschinenausbau', icon: 'together', badge: 'silver', title: '8 Etagen gleichzeitig auf Level 50', target: 50, value: levelRank(8), reward: rp(2) },
  { id: 'together_8x100', series: 'together', category: 'Maschinenausbau', icon: 'together', badge: 'gold', title: '8 Etagen gleichzeitig auf Level 100', target: 100, value: levelRank(8), reward: bean },
  { id: 'together_10x50', series: 'together', category: 'Maschinenausbau', icon: 'together', badge: 'platin', title: 'Alle 10 Etagen gleichzeitig auf Level 50', target: 50, value: levelRank(10), reward: PLATIN },
  { id: 'together_10x100', series: 'together', category: 'Maschinenausbau', icon: 'together', badge: 'diamant', title: 'Alle 10 Etagen gleichzeitig auf Level 100', target: 100, value: levelRank(10), reward: DIAMANT },
  { id: 'oberhaus_6', series: 'oberhaus', category: 'Maschinenausbau', icon: 'oberhaus', badge: 'bronze', title: 'Nougat-Werkstatt auf Level 100', target: 100, value: floorBest(5), reward: rp(2) },
  { id: 'oberhaus_7', series: 'oberhaus', category: 'Maschinenausbau', icon: 'oberhaus', badge: 'silver', title: 'Ruby-Temperierraum auf Level 100', target: 100, value: floorBest(6), reward: rp(3) },
  { id: 'oberhaus_8', series: 'oberhaus', category: 'Maschinenausbau', icon: 'oberhaus', badge: 'gold', title: 'Geschenkbox-Atelier auf Level 100', target: 100, value: floorBest(7), reward: rp(4) },
  { id: 'oberhaus_9', series: 'oberhaus', category: 'Maschinenausbau', icon: 'oberhaus', badge: 'platin', title: 'Skulpturen-Atelier auf Level 100', target: 100, value: floorBest(8), reward: PLATIN },
  { id: 'oberhaus_10', series: 'oberhaus', category: 'Maschinenausbau', icon: 'oberhaus', badge: 'diamant', title: 'Schokoladen-Galerie auf Level 100', target: 100, value: floorBest(9), reward: DIAMANT },

  /* Fabrikausbau */
  { id: 'floor_5', series: 'floor', category: 'Fabrikausbau', icon: 'factory', badge: 'cup', title: 'Etage 5 bauen', target: 5, value: (s) => s.stats.maxFloors, reward: rp(2) },
  { id: 'floor_6', series: 'floor', category: 'Fabrikausbau', icon: 'factory', badge: 'cup', title: 'Etage 6 bauen', target: 6, value: (s) => s.stats.maxFloors, reward: rp(2) },
  { id: 'floor_7', series: 'floor', category: 'Fabrikausbau', icon: 'factory', badge: 'cup', title: 'Etage 7 bauen', target: 7, value: (s) => s.stats.maxFloors, reward: rp(2) },
  { id: 'floor_8', series: 'floor', category: 'Fabrikausbau', icon: 'factory', badge: 'crown', title: 'Etage 8 bauen', target: 8, value: (s) => s.stats.maxFloors, reward: bean },
  { id: 'floor_9', series: 'floor', category: 'Fabrikausbau', icon: 'factory', badge: 'crown', title: 'Etage 9 bauen', target: 9, value: (s) => s.stats.maxFloors, reward: bean },
  { id: 'floor_10', series: 'floor', category: 'Fabrikausbau', icon: 'factory', badge: 'crown', title: 'Etage 10 bauen', target: 10, value: (s) => s.stats.maxFloors, reward: bean },

  /* Aufzug */
  ...series('lift', 'Aufzug', 'lift', (s) => s.stats.liftTrips, (n) => `${n} Aufzugfahrten abschließen`, [
    ['bronze', 10, rp(1)],
    ['silver', 100, rp(2)],
    ['gold', 500, rp(3)],
    ['platin', 10000, PLATIN],
    ['diamant', 50000, DIAMANT],
  ]),
  ...series('liftlevel', 'Aufzug', 'winch', (s) => s.stats.records.liftBest, (n) => `Aufzug auf Level ${n}`, [
    ['bronze', 50, rp(1)],
    ['silver', 100, rp(2)],
    ['gold', 200, rp(3)],
    ['platin', 300, PLATIN],
    ['diamant', 400, DIAMANT],
  ]),

  /* Auslieferung */
  ...series('trucks', 'Auslieferung', 'trucks', (s) => s.stats.vanTrips, (n) => `${n} Lieferfahrten abschließen`, [
    ['bronze', 10, rp(1)],
    ['silver', 100, rp(2)],
    ['gold', 500, rp(3)],
    ['platin', 25000, PLATIN],
    ['diamant', 150000, DIAMANT],
  ]),
  ...series('shiplevel', 'Auslieferung', 'crate', (s) => s.stats.records.shipBest, (n) => `Versand auf Level ${n}`, [
    ['bronze', 50, rp(1)],
    ['silver', 100, rp(2)],
    ['gold', 200, rp(3)],
    ['platin', 300, PLATIN],
    ['diamant', 400, DIAMANT],
  ]),

  /* Wirtschaft */
  ...series('income', 'Wirtschaft', 'coin', (s) => s.stats.records.bestIncome, (_, v) => `${money(v)} € pro Sekunde verdienen`, [
    ['bronze', 1e6, rp(1)],
    ['silver', 1e9, rp(2)],
    ['gold', 1e12, rp(3)],
    ['platin', 1e15, PLATIN],
    ['diamant', 1e18, DIAMANT],
  ], { unit: 'rate', hint: 'Engpass-Rate aus Produktion, Aufzug und Versand' }),
  ...series('earned', 'Wirtschaft', 'stats', (s) => s.stats.totalEarned.toNumber(), (_, v) => `Gesamtumsatz von ${money(v)} €`, [
    ['bronze', 1e9, rp(1)],
    ['silver', 1e12, rp(2)],
    ['gold', 1e15, rp(3)],
    ['platin', 1e18, PLATIN],
    ['diamant', 1e21, DIAMANT],
  ], { unit: 'money' }),
  ...series('flow', 'Wirtschaft', 'flow', (s) => s.stats.records.bestFlow, (_, v) => `Perfekter Fluss: ${minutes(v)}`, [
    ['bronze', 60, rp(1)],
    ['silver', 180, rp(2)],
    ['gold', 600, rp(3)],
  ], { unit: 'time', hint: 'Produktion, Aufzug und Versand höchstens 10 % auseinander' }),

  /* Personal */
  { id: 'manager_1', series: 'manager', category: 'Personal', icon: 'manager', badge: 'bronze', title: 'Ersten Manager einstellen', target: 1, value: (s) => s.stats.managersHired, reward: rp(1) },
  { id: 'manager_5', series: 'manager', category: 'Personal', icon: 'manager', badge: 'silver', title: '5 Manager einstellen', target: 5, value: (s) => s.stats.managersHired, reward: hire },
  { id: 'manager_15', series: 'manager', category: 'Personal', icon: 'manager', badge: 'gold', title: '15 Manager einstellen', target: 15, value: (s) => s.stats.managersHired, reward: hire },
  { id: 'manager_30', series: 'manager', category: 'Personal', icon: 'manager', badge: 'platin', title: '30 Manager einstellen', target: 30, value: (s) => s.stats.managersHired, reward: hire },
  { id: 'manager_60', series: 'manager', category: 'Personal', icon: 'manager', badge: 'diamant', title: '60 Manager einstellen', target: 60, value: (s) => s.stats.managersHired, reward: DIAMANT },
  { id: 'staff_12', category: 'Personal', icon: 'manager', badge: 'gold', title: 'Volle Besetzung: alle 12 Stationen gleichzeitig mit Manager', target: 12, value: (s) => s.stats.records.maxStaffed, reward: hire },

  /* Manager-Fähigkeiten */
  ...series('skill', 'Manager-Fähigkeiten', 'skill', (s) => s.stats.skillsUsed, (n) => `${n} Manager-Fähigkeiten auslösen`, [
    ['bronze', 5, rp(1)],
    ['silver', 25, rp(2)],
    ['gold', 100, rp(3)],
    ['platin', 500, PLATIN],
    ['diamant', 2500, DIAMANT],
  ]),

  /* Goldene Bohnen */
  { id: 'bean_1', series: 'bean', category: 'Goldene Bohnen', icon: 'bean', badge: 'bronze', title: 'Erste Goldene Bohne fangen', target: 1, value: (s) => s.stats.goldenCaught, reward: rp(1) },
  { id: 'bean_10', series: 'bean', category: 'Goldene Bohnen', icon: 'bean', badge: 'silver', title: '10 Goldene Bohnen fangen', target: 10, value: (s) => s.stats.goldenCaught, reward: rp(2) },
  { id: 'bean_50', series: 'bean', category: 'Goldene Bohnen', icon: 'bean', badge: 'gold', title: '50 Goldene Bohnen fangen', target: 50, value: (s) => s.stats.goldenCaught, reward: bean },
  { id: 'bean_200', series: 'bean', category: 'Goldene Bohnen', icon: 'bean', badge: 'platin', title: '200 Goldene Bohnen fangen', target: 200, value: (s) => s.stats.goldenCaught, reward: PLATIN },
  { id: 'bean_1000', series: 'bean', category: 'Goldene Bohnen', icon: 'bean', badge: 'diamant', title: '1.000 Goldene Bohnen fangen', target: 1000, value: (s) => s.stats.goldenCaught, reward: DIAMANT },

  /* Lieferverträge */
  ...series('contracts', 'Lieferverträge', 'contract', (s) => s.contracts.delivered, (n) => `${n} Lieferverträge erfüllen`, [
    ['bronze', 5, rp(1)],
    ['silver', 25, rp(2)],
    ['gold', 100, rp(3)],
    ['platin', 300, PLATIN],
    ['diamant', 1000, DIAMANT],
  ]),
  ...series('streak', 'Lieferverträge', 'deadline', (s) => s.stats.records.bestContractStreak, (n) => `${n} Verträge in Folge erfüllen`, [
    ['bronze', 10, rp(1)],
    ['silver', 25, rp(2)],
    ['gold', 50, rp(3)],
    ['platin', 100, PLATIN],
    ['diamant', 200, DIAMANT],
  ], { hint: 'Eine verpasste Frist oder ein Abbruch beginnt die Serie neu' }),
  { id: 'customers_all', category: 'Lieferverträge', icon: 'ruf', badge: 'gold', title: `Alle ${CUSTOMERS.length === 6 ? 'sechs' : CUSTOMERS.length} Kunden beliefern`, target: CUSTOMERS.length, value: (s) => s.stats.records.customers.length, reward: hire },

  /* Rezeptlabor */
  { id: 'lab_branch', series: 'lab', category: 'Rezeptlabor', icon: 'lab', badge: 'gold', title: 'Einen Forschungszweig komplett erforschen', target: 1, value: (s) => researchDone(s).branches, reward: rp(3) },
  { id: 'lab_all', series: 'lab', category: 'Rezeptlabor', icon: 'lab', badge: 'platin', title: 'Alle Forschungen abschließen', target: RESEARCH_RANKS, value: (s) => researchDone(s).ranks, reward: bean },

  /* Offline-Fortschritt */
  ...series('clock', 'Offline-Fortschritt', 'clock', (s) => s.stats.offlineSeconds, (_, v) => `${v >= 86400 * 2 ? `${v / 86400} Tage` : v >= 86400 ? '24 Stunden' : v === 3600 ? '1 Stunde' : `${v / 3600} Stunden`} Offline-Fortschritt sammeln`, [
    ['bronze', 3600, rp(1)],
    ['silver', 18000, rp(2)],
    ['gold', 86400, rp(3)],
    ['platin', 259200, PLATIN],
    ['diamant', 1209600, DIAMANT],
  ], { unit: 'time' }),

  /* Markenverkauf */
  { id: 'prestige_1', series: 'prestige', category: 'Prestige', icon: 'prestige', badge: 'bronze', title: 'Erste Marke verkaufen', target: 1, value: (s) => s.prestige.runs, reward: hire },
  { id: 'prestige_5', series: 'prestige', category: 'Prestige', icon: 'prestige', badge: 'silver', title: '5 Marken verkaufen', target: 5, value: (s) => s.prestige.runs, reward: bean },
  { id: 'prestige_10', series: 'prestige', category: 'Prestige', icon: 'prestige', badge: 'gold', title: '10 Marken verkaufen', target: 10, value: (s) => s.prestige.runs, reward: rp(3) },
  { id: 'prestige_25', series: 'prestige', category: 'Prestige', icon: 'prestige', badge: 'platin', title: '25 Marken verkaufen', target: 25, value: (s) => s.prestige.runs, reward: PLATIN },
  { id: 'prestige_50', series: 'prestige', category: 'Prestige', icon: 'prestige', badge: 'diamant', title: '50 Marken verkaufen', target: 50, value: (s) => s.prestige.runs, reward: DIAMANT },
  ...series('crowns', 'Prestige', 'crowns', (s) => s.prestige.crowns, (n) => `${n} Kronen besitzen`, [
    ['bronze', 25, rp(1)],
    ['silver', 100, rp(2)],
    ['gold', 500, rp(3)],
    ['platin', 1500, PLATIN],
    ['diamant', 3000, DIAMANT],
  ]),
  ...series('sale', 'Prestige', 'sale', (s) => s.stats.records.bestSale, (n) => `${n} Kronen bei einem einzigen Verkauf`, [
    ['bronze', 25, rp(1)],
    ['silver', 100, rp(2)],
    ['gold', 250, rp(3)],
    ['platin', 500, PLATIN],
    ['diamant', 1000, DIAMANT],
  ]),
  ...BLITZ.map(([badge, mins, reward]): Achievement => ({
    id: `blitz_${mins}`,
    series: 'blitz',
    category: 'Prestige',
    icon: 'speed',
    badge,
    title: `Blitzstart: Etage 8 in unter ${mins} Minuten`,
    hint: 'Gemessen ab dem Markenverkauf',
    target: 1,
    value: (s) => (s.stats.records.bestFloor8 !== null && s.stats.records.bestFloor8 < mins * 60 ? 1 : 0),
    text: floor8Text,
    reward,
  })),
  { id: 'treasury_full', category: 'Prestige', icon: 'treasury', badge: 'platin', title: 'Schatzkammer voll ausbauen', target: TREASURY_RANKS, value: treasuryBought, reward: bean },
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
