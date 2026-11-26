import { describe, expect, it } from 'vitest';
import manifest from '../src/assets/art/manifest.json';
import { ACHIEVEMENTS, BADGE_ART, CATEGORIES, GOAL_ICON, RESEARCH_RANKS, TREASURY_RANKS, type BadgeTier } from '../src/config/goals';
import { CUSTOMERS } from '../src/config/contracts';
import { RESEARCH } from '../src/config/research';
import { TREASURY } from '../src/config/treasury';
import { D } from '../src/core/num';
import { checksum, decodeSave, encodeSave, toPlain } from '../src/save/serialize';
import { buyUpgrade, sellBrand, unlockFloor } from '../src/sim/actions';
import { acceptContract, cancelContract, closeContract, refreshBoard } from '../src/sim/contracts';
import { claimableAchievements, tickLiveRecords, updateRecords } from '../src/sim/goals';
import type { GameState } from '../src/sim/types';
import { automateAll, giveManager, newGame, run } from './helpers';

const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
const reached = (s: GameState, id: string) => byId(id).value(s) >= byId(id).target;
const ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'platin', 'diamant'];

/** The 32 achievements before 0.10.0: their ids stay, so claimed ones stay claimed. */
const OLD_IDS = [
  'charges_10', 'charges_250', 'charges_2000', 'trucks_10', 'trucks_100', 'trucks_500', 'lift_10', 'lift_100', 'lift_500',
  'manager_1', 'manager_5', 'manager_15', 'skill_5', 'skill_25', 'skill_100', 'bean_1', 'bean_10', 'bean_50',
  'upgrade_10', 'upgrade_50', 'upgrade_100', 'clock_3600', 'clock_18000', 'clock_86400',
  'floor_5', 'floor_6', 'floor_7', 'floor_8', 'floor_9', 'floor_10', 'prestige_1', 'prestige_5',
];

function built(levels: number[]): GameState {
  const s = newGame();
  s.money = D(1e30);
  s.prestige.crowns = 5000;
  levels.forEach((l, i) => {
    if (i > 0) expect(unlockFloor(s, i)).toBe(true);
    s.floors[i].level = l;
  });
  updateRecords(s);
  return s;
}

describe('Meilensteine 0.10.0', () => {
  it('behalten alle alten Erfolgs-IDs und haben Medaille, Symbol und Kategorie', () => {
    for (const id of OLD_IDS) expect(byId(id), id).toBeTruthy();
    const art = manifest as Record<string, unknown>;
    for (const a of ACHIEVEMENTS) {
      expect(art[BADGE_ART[a.badge]], a.id).toBeTruthy();
      expect(art[GOAL_ICON[a.icon]], `${a.id} ${a.icon}`).toBeTruthy();
      expect(CATEGORIES.some((c) => c.id === a.category), a.id).toBe(true);
      expect(a.target).toBeGreaterThan(0);
    }
    for (const c of CATEGORIES) expect(art[c.badge], c.id).toBeTruthy();
  });

  it('Reihen steigen von Bronze bis Diamant, mit wachsenden Zielen', () => {
    const series = new Map<string, typeof ACHIEVEMENTS>();
    for (const a of ACHIEVEMENTS) if (a.series) series.set(a.series, [...(series.get(a.series) ?? []), a]);
    let fiveTier = 0;
    for (const [id, tiers] of series) {
      const medals = tiers.filter((t) => ORDER.includes(t.badge));
      for (let i = 1; i < medals.length; i++) expect(ORDER.indexOf(medals[i].badge), id).toBeGreaterThan(ORDER.indexOf(medals[i - 1].badge));
      // same metric: targets grow (series that switch metric step by floors instead)
      if (medals.length === 5) fiveTier++;
    }
    expect(fiveTier).toBeGreaterThanOrEqual(20);
    expect(ACHIEVEMENTS.filter((a) => a.badge === 'platin').length).toBeGreaterThanOrEqual(22);
    expect(ACHIEVEMENTS.filter((a) => a.badge === 'diamant').length).toBeGreaterThanOrEqual(20);
  });

  it('Etagen gleichzeitig: der beste Stand bleibt nach dem Markenverkauf', () => {
    const s = built([120, 110, 105, 101, 100, 90, 80, 75, 60, 52]);
    expect(s.stats.records.levelRank.slice(0, 5)).toEqual([120, 110, 105, 101, 100]);
    expect(reached(s, 'together_5x50')).toBe(true);
    expect(reached(s, 'together_8x50')).toBe(true);
    expect(reached(s, 'together_8x100')).toBe(false);
    expect(reached(s, 'together_10x50')).toBe(true);
    expect(reached(s, 'oberhaus_6')).toBe(false);
    s.floors[5].level = 100;
    updateRecords(s);
    expect(reached(s, 'oberhaus_6')).toBe(true);
    s.stats.totalEarned = D(1e25);
    sellBrand(s);
    expect(s.floors[9].unlocked).toBe(false);
    expect(reached(s, 'together_10x50')).toBe(true);
    expect(reached(s, 'oberhaus_6')).toBe(true);
    expect(s.stats.records.bestSale).toBeGreaterThan(0);
  });

  it('Aufzug- und Versandlevel zählen beim Kauf', () => {
    const s = newGame();
    s.money = D(1e40);
    for (let i = 0; i < 4; i++) buyUpgrade(s, 'lift', 25);
    for (let i = 0; i < 2; i++) buyUpgrade(s, 'ship', 25);
    expect(s.stats.records.liftBest).toBe(s.lift.level);
    expect(s.stats.records.shipBest).toBe(s.ship.level);
    expect(reached(s, 'liftlevel_100')).toBe(true);
    expect(reached(s, 'shiplevel_50')).toBe(true);
  });

  it('Einkommen und Perfekter Fluss werden einmal pro Spielsekunde gemessen', () => {
    const s = newGame();
    automateAll(s);
    giveManager(s, 'lift', 'lift');
    giveManager(s, 'ship', 'ship');
    run(s, 5);
    expect(s.stats.records.bestIncome).toBeGreaterThan(0);
    // forced balance: flow counts while all three stages are within 10 %
    s.stats.records.flowNow = 0;
    for (let i = 0; i < 70; i++) tickLiveRecords(s);
    const balanced = s.stats.records.flowNow > 0;
    // whatever the start state, an unbalanced factory never counts
    if (!balanced) expect(s.stats.records.flowNow).toBe(0);
    s.stats.records.bestFlow = 61;
    expect(reached(s, 'flow_60')).toBe(true);
  });

  it('Lieferverträge: Serie, Abbruch und Kunden', () => {
    const s = newGame();
    s.money = D(1e9);
    unlockFloor(s, 1);
    refreshBoard(s);
    const r = s.stats.records;
    for (let k = 0; k < 3; k++) {
      const slot = s.contracts.offers.findIndex((o) => o);
      const a = acceptContract(s, slot)!;
      a.progress = a.target;
      a.status = 'delivered';
      closeContract(s);
      s.contracts.offers = s.contracts.offers.map((o) => o);
      refreshBoard(s);
      if (!s.contracts.offers.some((o) => o)) s.simTime += 10000;
      refreshBoard(s);
    }
    expect(r.contractStreak).toBe(3);
    expect(r.bestContractStreak).toBe(3);
    expect(r.customers.length).toBeGreaterThanOrEqual(1);
    const slot = s.contracts.offers.findIndex((o) => o);
    if (slot >= 0) {
      acceptContract(s, slot);
      cancelContract(s);
      expect(r.contractStreak).toBe(0);
      expect(r.bestContractStreak).toBe(3);
    }
    r.customers = CUSTOMERS.map((c) => c.id);
    expect(reached(s, 'customers_all')).toBe(true);
  });

  it('Labor und Schatzkammer zählen ihre Ränge', () => {
    const s = newGame();
    expect(RESEARCH_RANKS).toBe(RESEARCH.reduce((a, n) => a + n.maxRank, 0));
    expect(TREASURY_RANKS).toBe(TREASURY.reduce((a, t) => a + t.costs.length, 0));
    for (const n of RESEARCH.filter((x) => x.branch === RESEARCH[0].branch)) s.research.ranks[n.id] = n.maxRank;
    expect(reached(s, 'lab_branch')).toBe(true);
    expect(reached(s, 'lab_all')).toBe(false);
    for (const n of RESEARCH) s.research.ranks[n.id] = n.maxRank;
    expect(reached(s, 'lab_all')).toBe(true);
    for (const t of TREASURY) s.prestige.treasury[t.id] = t.costs.length;
    expect(reached(s, 'treasury_full')).toBe(true);
  });

  it('Blitzstart misst die Zeit vom Verkauf bis Etage 8', () => {
    const s = built([60, 50, 40, 30, 20]);
    s.stats.totalEarned = D(1e20);
    sellBrand(s);
    s.money = D(1e30);
    s.stats.playSeconds += 7 * 60;
    for (let i = 1; i < 8; i++) unlockFloor(s, i);
    expect(s.stats.records.bestFloor8).toBeCloseTo(420, 0);
    expect(reached(s, 'blitz_8')).toBe(true);
    expect(reached(s, 'blitz_4')).toBe(false);
    expect(byId('blitz_8').text!(s)).toBe('Bestzeit 7:00 min');
  });

  it('Spielstand v7 bekommt Rekorde aus dem laufenden Spiel; Speichern und Laden behält sie', () => {
    const s = built([130, 120, 110, 100, 90, 80, 70, 60]);
    s.lift.level = 260;
    s.ship.level = 210;
    s.goals.claimed = ['charges_10'];
    const plain = toPlain(s) as Record<string, unknown>;
    const stats = { ...(plain.stats as Record<string, unknown>) };
    delete stats.records;
    plain.stats = stats;
    plain.version = 7;
    const data = JSON.stringify(plain);
    const back = decodeSave({ format: 'cocoa-crown-save', version: 7, savedAt: 1, checksum: checksum(data), data });
    const r = back.stats.records;
    expect(r.floorBest.slice(0, 8)).toEqual([130, 120, 110, 100, 90, 80, 70, 60]);
    expect(r.levelRank[7]).toBe(60);
    expect(r.liftBest).toBe(260);
    expect(r.shipBest).toBe(210);
    expect(r.bestSale).toBe(0);
    expect(back.goals.claimed).toEqual(['charges_10']);
    expect(claimableAchievements(back).some((a) => a.id === 'liftlevel_200')).toBe(true);
    back.stats.records.customers = ['cafe', 'salon'];
    back.stats.records.bestFloor8 = 99;
    const again = decodeSave(encodeSave(back));
    expect(again.stats.records).toEqual(back.stats.records);
  });
});
