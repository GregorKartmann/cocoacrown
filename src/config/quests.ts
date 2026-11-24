import type { GameState, StationId } from '../sim/types';
import { analyzeFlow } from '../sim/formulas';

export interface QuestDef {
  id: string;
  title: string;
  text: string;
  target: number;
  /** Current progress toward target (clamped by the UI). */
  progress: (s: GameState) => number;
  reward: number;
  /** Station the UI highlights to guide the player. */
  focus?: StationId;
}

const maxFloorLevel = (s: GameState) => s.floors.reduce((m, f) => (f.unlocked ? Math.max(m, f.level) : m), 0);
const assignedCount = (s: GameState) => s.managers.filter((m) => m.assignedTo).length;
const incomeNow = (s: GameState) => analyzeFlow(s).income.toNumber();
const autoLogistics = (s: GameState) => (s.lift.managerId ? 1 : 0) + (s.ship.managerId ? 1 : 0);

/**
 * Guided quest chain for the first 30–45 minutes. Rewards are tuned with the
 * balancing bot (tests/balance.report.test.ts) to roughly 30–60 s of income at
 * the expected completion time, so they matter without breaking pacing.
 */
export const QUESTS: QuestDef[] = [
  { id: 'q-first-batch', title: 'Erste Röstung', text: 'Tippe auf den Trommelröster, um eine Charge Röstnibs herzustellen.', target: 1, progress: (s) => s.stats.batches, reward: 3, focus: 'f0' },
  { id: 'q-first-lift', title: 'Ab ins Erdgeschoss', text: 'Tippe auf den Aufzug. Er holt die Ware ab und bringt sie ins Versandlager.', target: 1, progress: (s) => s.stats.liftTrips, reward: 3, focus: 'lift' },
  { id: 'q-first-sale', title: 'Erster Verkauf', text: 'Tippe auf die Laderampe. Die Lieferwagen verkaufen die Ware in der Stadt.', target: 1, progress: (s) => s.stats.vanTrips, reward: 5, focus: 'ship' },
  { id: 'q-nibs-5', title: 'Mehr Röstkraft', text: 'Verbessere den Trommelröster auf Level 5.', target: 5, progress: (s) => s.floors[0].level, reward: 15, focus: 'f0' },
  { id: 'q-manager', title: 'Die erste Fachkraft', text: 'Stelle einen Manager ein und weise ihn einer Station zu. Er übernimmt das Tippen.', target: 1, progress: assignedCount, reward: 40 },
  { id: 'q-skill', title: 'Volle Kraft', text: 'Setze die Fähigkeit deines Managers ein: Tippe auf sein leuchtendes Porträt an der Station.', target: 1, progress: (s) => s.stats.skillsUsed, reward: 60 },
  { id: 'q-earn-300', title: 'Kleiner Umsatz', text: 'Verdiene insgesamt 300 €.', target: 300, progress: (s) => s.stats.totalEarned.toNumber(), reward: 150 },
  { id: 'q-milestone-10', title: 'Erster Meilenstein', text: 'Bringe eine Etage auf Level 10. Ein zweiter Arbeiter hilft mit und die Menge verdoppelt sich.', target: 10, progress: maxFloorLevel, reward: 250 },
  { id: 'q-auto-logistics', title: 'Läuft von allein', text: 'Automatisiere Aufzug und Versand mit je einem Manager.', target: 2, progress: autoLogistics, reward: 300 },
  { id: 'q-golden', title: 'Goldene Kakaobohne', text: 'Fange eine Goldene Kakaobohne, wenn sie über den Bildschirm schwebt.', target: 1, progress: (s) => s.stats.goldenCaught, reward: 250 },
  { id: 'q-ship-10', title: 'Zweiter Lieferwagen', text: 'Verbessere den Versand auf Level 10. Ein zweiter Lieferwagen fährt mit.', target: 10, progress: (s) => s.ship.level, reward: 300, focus: 'ship' },
  { id: 'q-lift-10', title: 'Starker Aufzug', text: 'Verbessere den Aufzug auf Level 10. Seine Kapazität verdoppelt sich.', target: 10, progress: (s) => s.lift.level, reward: 500, focus: 'lift' },
  { id: 'q-income-150', title: 'Engpass-Profi', text: 'Erreiche ein Einkommen von 150 €/s. Achte auf rot markierte Engpässe.', target: 150, progress: incomeNow, reward: 800 },
  { id: 'q-milestone-25', title: 'Tempo-Meilenstein', text: 'Bringe eine Etage auf Level 25. Die Maschine läuft doppelt so schnell.', target: 25, progress: maxFloorLevel, reward: 1500 },
  { id: 'q-cocoa', title: 'Neue Etage', text: 'Baue die zweite Etage: Trinkkakao.', target: 1, progress: (s) => (s.floors[1].unlocked ? 1 : 0), reward: 5000, focus: 'f1' },
  { id: 'q-bars', title: 'Tafelschokolade', text: 'Baue die dritte Etage: Tafelschokolade.', target: 1, progress: (s) => (s.floors[2].unlocked ? 1 : 0), reward: 40000, focus: 'f2' },
  { id: 'q-managers-5', title: 'Führungsteam', text: 'Beschäftige fünf zugewiesene Manager.', target: 5, progress: assignedCount, reward: 60000 },
  { id: 'q-income-5k', title: 'Schokoladen-Konzern', text: 'Erreiche ein Einkommen von 5.000 €/s.', target: 5000, progress: incomeNow, reward: 100000 },
  { id: 'q-pralines', title: 'Pralinen', text: 'Baue die vierte Etage: Pralinen.', target: 1, progress: (s) => (s.floors[3].unlocked ? 1 : 0), reward: 400000, focus: 'f3' },
  { id: 'q-truffles', title: 'Das Kronjuwel', text: 'Baue die fünfte Etage: das Trüffel-Atelier.', target: 1, progress: (s) => (s.floors[4].unlocked ? 1 : 0), reward: 6000000, focus: 'f4' },
  { id: 'q-level-100', title: 'Meisterbetrieb', text: 'Bringe eine Etage auf Level 100. Die Maschine erreicht ihre höchste Ausbaustufe.', target: 100, progress: maxFloorLevel, reward: 50000000 },
  { id: 'q-prestige', title: 'Eine Krone für die Marke', text: 'Verkaufe deine Marke (Krone oben neben den Einstellungen). Du startest neu, behältst aber deine Manager und bekommst dauerhaft mehr Einkommen.', target: 1, progress: (s) => s.prestige.runs, reward: 250 },
];
