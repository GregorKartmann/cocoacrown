/**
 * Kronen-Schatzkammer: crowns from brand sales buy permanent start bonuses.
 *
 * Spending a crown does not take its income bonus away – every crown still
 * counts +10 % on the sale price. The treasury only decides how quickly a new
 * run gets going after a sale (and how long the factory works offline). A
 * rank bought mid-run applies its difference right away.
 */
export type TreasuryId = 'startetagen' | 'startkapital' | 'startaufzug' | 'startlager' | 'startmanager' | 'offline_zeit';

export interface TreasuryBonus {
  id: TreasuryId;
  name: string;
  icon: string;
  /** Crowns for rank 1, 2, … */
  costs: number[];
  /** Effect per rank (index = rank − 1). */
  values: number[];
  /** Effect line for a rank. */
  text: (value: number) => string;
  /** What the bonus does (one line). */
  desc: string;
  /** Value alone, for "10 → 25". */
  short: (value: number) => string;
}

const euro = (v: number) => `${v.toLocaleString('de-DE')} €`;

export const TREASURY: TreasuryBonus[] = [
  {
    id: 'startetagen',
    name: 'Schnellere Startetagen',
    icon: 'schatzkammer/boni/startetagen',
    costs: [4, 10, 20, 35, 60],
    values: [10, 25, 50, 75, 100],
    desc: 'Etagen 1–3 starten nach jedem Verkauf höher',
    short: (v) => `Stufe ${v}`,
    text: (v) => `Etagen 1–3 starten mit Stufe ${v}`,
  },
  {
    id: 'startkapital',
    name: 'Startkapital',
    icon: 'schatzkammer/boni/startkapital',
    costs: [4, 12, 30, 60],
    values: [15000, 250000, 5000000, 100000000],
    desc: 'Geld für den Start jeder neuen Manufaktur',
    short: (v) => euro(v),
    text: (v) => `Neustart mit ${euro(v)}`,
  },
  {
    id: 'startaufzug',
    name: 'Verbesserter Startaufzug',
    icon: 'schatzkammer/boni/startaufzug',
    costs: [3, 9, 20, 40],
    values: [10, 25, 50, 100],
    desc: 'Der Lastenaufzug startet höher',
    short: (v) => `Stufe ${v}`,
    text: (v) => `Aufzug startet mit Stufe ${v}`,
  },
  {
    id: 'startlager',
    name: 'Größeres Startlager',
    icon: 'schatzkammer/boni/startlager',
    costs: [3, 9, 20, 40],
    values: [10, 25, 50, 100],
    desc: 'Versandlager und Lieferwagen starten höher',
    short: (v) => `Stufe ${v}`,
    text: (v) => `Versandlager startet mit Stufe ${v}`,
  },
  {
    id: 'startmanager',
    name: 'Manager ab Start',
    icon: 'schatzkammer/boni/startmanager',
    costs: [6, 20, 50],
    values: [1, 2, 3],
    desc: 'Kostenlose Einstellungen nach jedem Verkauf',
    short: (v) => `${v} Manager`,
    text: (v) => (v === 1 ? 'Nach jedem Verkauf 1 Manager kostenlos' : `Nach jedem Verkauf ${v} Manager kostenlos`),
  },
  {
    id: 'offline_zeit',
    name: 'Mehr Offline-Zeit',
    icon: 'schatzkammer/boni/offline_zeit',
    costs: [5, 12, 25, 45],
    values: [1, 2, 3, 4],
    desc: 'Die Manufaktur arbeitet länger ohne dich',
    short: (v) => `+${v} h`,
    text: (v) => `+${v} ${v === 1 ? 'Stunde' : 'Stunden'} Offline-Zeit`,
  },
];

export const TREASURY_BY_ID = Object.fromEntries(TREASURY.map((b) => [b.id, b])) as Record<TreasuryId, TreasuryBonus>;
export const TREASURY_IDS = TREASURY.map((b) => b.id);
