/**
 * Rezeptlabor: four branches with three nodes each. Node 2 needs rank 2 of
 * node 1, node 3 (the branch's "Meisterstück") needs rank 3 of node 2.
 * Research costs Rezeptpunkte (earned for milestones, new floors and quests –
 * never for money) and takes real time; one research runs at a time and it
 * keeps running while the player is away. Ranks survive the brand sale.
 *
 * Effect values are per rank; formulas.ts reads them through researchFactor().
 */

export type ResearchId =
  | 'schnellere_zyklen'
  | 'waermefuehrung'
  | 'chargengroesse'
  | 'lieferflotte'
  | 'lagerkapazitaet'
  | 'routenplanung'
  | 'rezeptentwicklung'
  | 'qualitaetskontrolle'
  | 'meisterrezept'
  | 'verkaufsstellen'
  | 'markensiegel'
  | 'premiumsortiment';

export type BranchId = 'produktion' | 'logistik' | 'rezepte' | 'vertrieb';

export interface ResearchNode {
  id: ResearchId;
  branch: BranchId;
  tier: 1 | 2 | 3;
  name: string;
  /** What one rank does, for the detail panel. */
  perRank: string;
  /** Effect text for a given total rank (0 = not researched). */
  effect: (rank: number) => string;
  maxRank: number;
  /** Points for rank r (index r-1). */
  cost: number[];
  /** Seconds for rank r (index r-1), before Rezeptentwicklung. */
  duration: number[];
  /** Prerequisite: node and rank. */
  requires?: { id: ResearchId; rank: number };
}

export interface Branch {
  id: BranchId;
  name: string;
  accent: string;
  icon: string;
}

export const BRANCHES: Branch[] = [
  { id: 'produktion', name: 'Produktion', accent: '#e9ad58', icon: 'forschung/symbole/produktion' },
  { id: 'logistik', name: 'Logistik', accent: '#62c0c5', icon: 'forschung/symbole/logistik' },
  { id: 'rezepte', name: 'Rezepte & Qualität', accent: '#caa1dd', icon: 'forschung/symbole/rezepte' },
  { id: 'vertrieb', name: 'Vertrieb & Marke', accent: '#fa9783', icon: 'forschung/symbole/vertrieb' },
];

const T1 = { maxRank: 5, cost: [1, 2, 3, 4, 5], duration: [120, 300, 600, 1200, 1800] };
const T2 = { maxRank: 5, cost: [2, 3, 5, 7, 9], duration: [300, 600, 1200, 2400, 3600] };
const T3 = { maxRank: 3, cost: [6, 10, 15], duration: [1800, 3600, 7200] };

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Offline hours by Lagerkapazität rank (base 3 h, up to 12 h). */
export const OFFLINE_HOURS = [3, 4, 6, 8, 10, 12];

export const RESEARCH: ResearchNode[] = [
  // Produktion
  { id: 'schnellere_zyklen', branch: 'produktion', tier: 1, name: 'Schnellere Zyklen', perRank: '+6 % Tempo aller Etagen', effect: (r) => `+${pct(0.06 * r)} Tempo aller Etagen`, ...T1 },
  { id: 'waermefuehrung', branch: 'produktion', tier: 2, name: 'Wärmeführung', perRank: '−5 % Upgradekosten der Etagen', effect: (r) => `−${pct(0.05 * r)} Upgradekosten der Etagen`, requires: { id: 'schnellere_zyklen', rank: 2 }, ...T2 },
  { id: 'chargengroesse', branch: 'produktion', tier: 3, name: 'Chargengröße', perRank: '+25 % Ware pro Zyklus', effect: (r) => `+${pct(0.25 * r)} Ware pro Zyklus`, requires: { id: 'waermefuehrung', rank: 3 }, ...T3 },
  // Logistik
  { id: 'lieferflotte', branch: 'logistik', tier: 1, name: 'Lieferflotte', perRank: '+10 % Ladung der Lieferwagen', effect: (r) => `+${pct(0.1 * r)} Ladung der Lieferwagen`, ...T1 },
  {
    id: 'lagerkapazitaet',
    branch: 'logistik',
    tier: 2,
    name: 'Lagerkapazität',
    perRank: '+30 % Zwischenlager, längere Offline-Zeit',
    effect: (r) => `+${pct(0.3 * r)} Zwischenlager · Offline bis ${OFFLINE_HOURS[r]} h`,
    requires: { id: 'lieferflotte', rank: 2 },
    ...T2,
  },
  { id: 'routenplanung', branch: 'logistik', tier: 3, name: 'Routenplanung', perRank: '+15 % Tempo für Aufzug und Lieferwagen', effect: (r) => `+${pct(0.15 * r)} Tempo für Aufzug und Lieferwagen`, requires: { id: 'lagerkapazitaet', rank: 3 }, ...T3 },
  // Rezepte & Qualität
  { id: 'rezeptentwicklung', branch: 'rezepte', tier: 1, name: 'Rezeptentwicklung', perRank: '−8 % Forschungsdauer', effect: (r) => `−${pct(0.08 * r)} Forschungsdauer`, ...T1 },
  {
    id: 'qualitaetskontrolle',
    branch: 'rezepte',
    tier: 2,
    name: 'Qualitätskontrolle',
    perRank: 'Goldene Kakaobohne öfter und wertvoller',
    effect: (r) => `Goldene Kakaobohne ${pct(0.06 * r)} öfter, Belohnung +${pct(0.2 * r)}`,
    requires: { id: 'rezeptentwicklung', rank: 2 },
    ...T2,
  },
  {
    id: 'meisterrezept',
    branch: 'rezepte',
    tier: 3,
    name: 'Meisterrezept',
    perRank: 'Manager-Fähigkeiten länger und öfter',
    effect: (r) => `Fähigkeiten +${pct(0.2 * r)} Dauer, −${pct(0.1 * r)} Pause`,
    requires: { id: 'qualitaetskontrolle', rank: 3 },
    ...T3,
  },
  // Vertrieb & Marke
  { id: 'verkaufsstellen', branch: 'vertrieb', tier: 1, name: 'Verkaufsstellen', perRank: '+6 % Verkaufspreis', effect: (r) => `+${pct(0.06 * r)} Verkaufspreis`, ...T1 },
  { id: 'markensiegel', branch: 'vertrieb', tier: 2, name: 'Markensiegel', perRank: 'Jede Krone +1 % stärker', effect: (r) => `Jede Krone +${10 + r} % statt +10 %`, requires: { id: 'verkaufsstellen', rank: 2 }, ...T2 },
  {
    id: 'premiumsortiment',
    branch: 'vertrieb',
    tier: 3,
    name: 'Premiumsortiment',
    perRank: '+30 % Wert für Nougat, Ruby und Signature-Box',
    effect: (r) => `+${pct(0.3 * r)} Wert der Etagen 6–8`,
    requires: { id: 'markensiegel', rank: 3 },
    ...T3,
  },
];

export const RESEARCH_BY_ID: Record<ResearchId, ResearchNode> = Object.fromEntries(RESEARCH.map((n) => [n.id, n])) as Record<ResearchId, ResearchNode>;

export const RESEARCH_IDS = RESEARCH.map((n) => n.id);

/** Rezeptpunkte rewards. */
export const RESEARCH_POINTS = {
  /** per milestone level reached on any station */
  milestone: 1,
  /** per floor built */
  floor: 1,
  /** per quest claimed */
  quest: 1,
  /** for selling the brand */
  brandSale: 3,
};

/** The lab opens with the 3rd floor (and stays open after a brand sale). */
export const LAB_FLOOR = 2;
