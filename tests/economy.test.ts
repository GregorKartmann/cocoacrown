import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { D, approxEqual } from '../src/core/num';
import {
  analyzeFlow,
  bulkUpgradeCost,
  costParams,
  floorMilestoneFactors,
  floorStats,
  geometricUpgradeCost,
  liftStats,
  maxAffordableLevels,
  shipStats,
  singleUpgradeCost,
} from '../src/sim/formulas';
import { buyUpgrade, quoteUpgrade } from '../src/sim/actions';
import { giveManager, newGame } from './helpers';

describe('Upgrade-Kosten', () => {
  const p = costParams('f0');

  it('Mehrfach-Upgrades kosten exakt die Summe der Einzel-Upgrades', () => {
    for (const level of [1, 7, 49, 120, 600]) {
      for (const n of [10, 25, 100]) {
        let sum = D(0);
        for (let k = 0; k < n; k++) sum = sum.add(singleUpgradeCost(p, level + k, 1));
        expect(bulkUpgradeCost(p, level, n, 1).eq(sum)).toBe(true);
        expect(approxEqual(geometricUpgradeCost(p, level, n, 1), sum, 1e-9)).toBe(true);
      }
    }
  });

  it('×10 kaufen hinterlässt denselben Kontostand wie 10 Einzelkäufe', () => {
    const a = newGame();
    const b = newGame();
    a.money = D('1e6');
    b.money = D('1e6');
    buyUpgrade(a, 'f0', 10);
    for (let i = 0; i < 10; i++) buyUpgrade(b, 'f0', 1);
    expect(a.floors[0].level).toBe(11);
    expect(b.floors[0].level).toBe(11);
    expect(approxEqual(a.money, b.money, 1e-12)).toBe(true);
  });

  it('MAX kauft die größtmögliche bezahlbare Anzahl', () => {
    const s = newGame();
    s.money = D(5000);
    const n = maxAffordableLevels(p, 1, s.money, 1);
    expect(bulkUpgradeCost(p, 1, n, 1).lte(s.money)).toBe(true);
    expect(bulkUpgradeCost(p, 1, n + 1, 1).gt(s.money)).toBe(true);
    const q = quoteUpgrade(s, 'f0', 'max');
    expect(q.levels).toBe(n);
    expect(buyUpgrade(s, 'f0', 'max')).toBe(n);
    expect(s.money.gte(0)).toBe(true);
  });

  it('MAX funktioniert auch mit astronomischen Beträgen', () => {
    const s = newGame();
    s.money = D('1e400');
    const q = quoteUpgrade(s, 'lift', 'max');
    expect(q.levels).toBe(BALANCE.lift.maxLevel - 1);
    expect(q.cost.lte(s.money)).toBe(true);
  });

  it('Nicht bezahlbare Upgrades werden abgelehnt und kosten nichts', () => {
    const s = newGame();
    s.money = D(1);
    expect(buyUpgrade(s, 'f0', 1)).toBe(0);
    expect(s.money.eq(1)).toBe(true);
  });

  it('Sparfuchs senkt die Kosten um den Rabatt seiner Seltenheit', () => {
    const s = newGame();
    const base = quoteUpgrade(s, 'f0', 10).cost;
    giveManager(s, 'floor', 'f0', 'cost', 2); // episch: -30 %
    const cut = quoteUpgrade(s, 'f0', 10).cost;
    expect(approxEqual(cut, base.mul(0.7), 1e-12)).toBe(true);
  });
});

describe('Produktionswerte', () => {
  it('Level skaliert die Menge linear, Meilensteine multiplizieren', () => {
    const s = newGame();
    const l1 = floorStats(s, 0);
    s.floors[0].level = 9;
    const l9 = floorStats(s, 0);
    expect(approxEqual(l9.batch, l1.batch.mul(9))).toBe(true);
    s.floors[0].level = 10;
    const l10 = floorStats(s, 0);
    expect(approxEqual(l10.batch, l1.batch.mul(10 * 2))).toBe(true);
    s.floors[0].level = 25;
    expect(floorStats(s, 0).cycle).toBeCloseTo(BALANCE.floors[0].baseCycle / 2, 9);
  });

  it('Zyklen werden nie kürzer als das Minimum, der Rest wird zu Menge', () => {
    const s = newGame();
    s.floors[0].level = 100; // speed ×4 → 0,75 s
    giveManager(s, 'floor', 'f0', 'speed', 3); // +100 %
    const st = floorStats(s, 0);
    expect(st.cycle).toBeGreaterThanOrEqual(BALANCE.floor.minCycle - 1e-12);
    // rate must equal the unconstrained rate (speed converted into yield)
    const ms = floorMilestoneFactors(100);
    const expected = D(BALANCE.floors[0].baseUnits * 100 * ms.yield * BALANCE.floors[0].unitValue).mul(ms.speed * 2).div(BALANCE.floors[0].baseCycle);
    expect(approxEqual(st.rate, expected, 1e-9)).toBe(true);
  });

  it('Mehr Etagen verlängern die Aufzugsfahrt', () => {
    const s = newGame();
    const t1 = liftStats(s).tripTime;
    s.floors[1].unlocked = true;
    expect(liftStats(s).tripTime).toBeGreaterThan(t1);
  });

  it('Versand-Meilensteine bringen zusätzliche Lieferwagen', () => {
    const s = newGame();
    expect(shipStats(s).vans).toBe(1);
    s.ship.level = 10;
    expect(shipStats(s).vans).toBe(2);
    s.ship.level = 100;
    expect(shipStats(s).vans).toBe(5);
  });

  it('Flussanalyse erkennt die langsamste Stufe', () => {
    const s = newGame();
    s.floors[0].level = 40;
    const f = analyzeFlow(s);
    expect(f.bottleneck).not.toBe('production');
    expect(f.income.eq(f.lift.lt(f.ship) ? f.lift : f.ship)).toBe(true);
  });
});
