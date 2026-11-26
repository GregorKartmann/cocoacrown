import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { D } from '../src/core/num';
import { checksum, decodeSave, encodeSave, toPlain } from '../src/save/serialize';
import { sellBrand, unlockFloor } from '../src/sim/actions';
import { crownFactor, crownStepStart, crownsAvailable, crownsByEarnings, earningsForCrowns, nextCrownAt, prestigeUnlocked, shipStats } from '../src/sim/formulas';
import { createGame } from '../src/sim/init';
import type { GameState } from '../src/sim/types';
import { runBot } from './bot';
import { giveManager, newGame } from './helpers';

const DIV = BALANCE.prestige.divisor;

/** A game that has reached the 5th floor once and earned `earned` in total. */
function lateGame(earned: number): GameState {
  const s = newGame();
  s.money = D(1e12);
  for (let i = 1; i < s.floors.length; i++) unlockFloor(s, i);
  s.stats.totalEarned = D(earned);
  s.money = D(123456);
  return s;
}

describe('Prestige: Kronen-Formel', () => {
  it('Kronen = ⌊√(Gesamtumsatz / Teiler)⌋, genau an den Grenzen', () => {
    expect(crownsByEarnings(D(0))).toBe(0);
    expect(crownsByEarnings(D(DIV - 1))).toBe(0);
    expect(crownsByEarnings(D(DIV))).toBe(1);
    expect(crownsByEarnings(D(4 * DIV - 1))).toBe(1);
    expect(crownsByEarnings(D(4 * DIV))).toBe(2);
    expect(crownsByEarnings(D(100 * DIV))).toBe(10);
    // huge numbers stay finite
    expect(crownsByEarnings(D('1e80'))).toBeGreaterThan(1e15);
  });

  it('Spielstände mit vielen Kronen aus der Zeit vor der steileren Kurve bekommen weiter Kronen', () => {
    // 3000 crowns earned with the old square root: lifetime 3000² · divisor at the last sale
    const s = lateGame(3000 * 3000 * DIV);
    s.prestige.crowns = 3000;
    s.prestige.runs = 12;
    s.prestige.runStartEarned = D(3000 * 3000 * DIV);
    s.prestige.spent = 2000; // the treasury does not matter for the sale
    expect(crownsAvailable(s)).toBe(0);
    s.stats.totalEarned = s.stats.totalEarned.mul(1.5);
    const gain = crownsAvailable(s);
    expect(gain).toBeGreaterThan(50);
    expect(nextCrownAt(s).gt(s.stats.totalEarned)).toBe(true);
    expect(crownStepStart(s).lte(s.stats.totalEarned)).toBe(true);
    expect(sellBrand(s)).toBe(gain);
    expect(s.prestige.crowns).toBe(3000 + gain);
  });

  it('ab 100 Kronen gilt die vierte Wurzel: doppelt so viele Kronen brauchen 16× Umsatz', () => {
    expect(crownsByEarnings(D(10000 * DIV))).toBe(100);
    expect(crownsByEarnings(D(10000 * DIV).mul(0.9999))).toBe(99);
    expect(crownsByEarnings(D(160000 * DIV))).toBe(200);
    expect(crownsByEarnings(D(160000 * DIV).mul(0.999))).toBe(199);
    expect(earningsForCrowns(200).div(DIV).toNumber()).toBeCloseTo(160000, 6);
    expect(earningsForCrowns(100).eq(10000 * DIV)).toBe(true);
    for (const k of [101, 150, 333, 1000]) expect(crownsByEarnings(earningsForCrowns(k).mul(1.0000001))).toBe(k);
  });

  it('Bereits erhaltene Kronen werden abgezogen, die nächste Krone liegt bei (k+1)² · Teiler', () => {
    const s = lateGame(30 * DIV);
    expect(crownsAvailable(s)).toBe(5);
    expect(sellBrand(s)).toBe(5);
    expect(s.prestige.crowns).toBe(5);
    expect(crownsAvailable(s)).toBe(0);
    expect(nextCrownAt(s).eq(36 * DIV)).toBe(true);
    s.stats.totalEarned = D(36 * DIV);
    expect(crownsAvailable(s)).toBe(1);
  });

  it('Jede Krone erhöht den Verkaufspreis um 10 %', () => {
    const s = newGame();
    const base = shipStats(s).priceFactor;
    s.prestige.crowns = 7;
    expect(crownFactor(s)).toBeCloseTo(1.7, 9);
    expect(shipStats(s).priceFactor).toBeCloseTo(base * 1.7, 9);
  });

  it('Verkaufen geht erst, wenn die 5. Etage einmal gebaut wurde', () => {
    const s = newGame();
    s.stats.totalEarned = D(50 * DIV);
    expect(prestigeUnlocked(s)).toBe(false);
    expect(sellBrand(s)).toBe(0);
    const t = lateGame(50 * DIV);
    expect(prestigeUnlocked(t)).toBe(true);
    expect(sellBrand(t)).toBe(7);
  });
});

describe('Prestige: Marke verkaufen', () => {
  it('setzt Geld, Etagen, Level und Logistik zurück und behält Kronen, Manager, Aufträge, Statistik', () => {
    const s = lateGame(50 * DIV);
    s.floors[0].level = 80;
    s.floors[3].level = 40;
    s.lift.level = 60;
    s.ship.level = 55;
    s.quest.index = 17;
    s.settings.sound = false;
    s.boosts.push({ kind: 'rush', factor: 2, remaining: 20, total: 45 });
    const m0 = giveManager(s, 'floor', 'f0');
    const m3 = giveManager(s, 'floor', 'f3');
    const ml = giveManager(s, 'lift', 'lift');
    m3.skillCooldown = 200;
    const hiresBefore = { ...s.hires };
    const earned = s.stats.totalEarned;

    expect(sellBrand(s)).toBe(7);

    expect(s.prestige.crowns).toBe(7);
    expect(s.prestige.runs).toBe(1);
    expect(s.money.eq(BALANCE.startMoney)).toBe(true);
    expect(s.floors.filter((f) => f.unlocked).length).toBe(1);
    expect(s.floors.every((f) => f.level === 1)).toBe(true);
    expect(s.lift.level).toBe(1);
    expect(s.ship.level).toBe(1);
    expect(s.ship.vans.length).toBe(1);
    expect(s.boosts.length).toBe(0);
    // kept
    expect(s.quest.index).toBe(17);
    expect(s.settings.sound).toBe(false);
    expect(s.stats.totalEarned.eq(earned)).toBe(true);
    expect(s.prestige.runStartEarned.eq(earned)).toBe(true);
    expect(s.hires).toEqual(hiresBefore);
    expect(s.managers.length).toBe(3);
    // floor 1 and lift keep their managers, floor 4's manager waits for her floor
    expect(s.floors[0].managerId).toBe(m0.id);
    expect(s.lift.managerId).toBe(ml.id);
    expect(m3.assignedTo).toBeNull();
    expect(m3.home).toBe('f3');
    expect(m3.skillCooldown).toBe(0);
    // nothing to sell right after the sale
    expect(crownsAvailable(s)).toBe(0);
    expect(sellBrand(s)).toBe(0);
  });

  it('Manager kehren beim Neubau ihrer Etage automatisch zurück', () => {
    const s = lateGame(50 * DIV);
    const m2 = giveManager(s, 'floor', 'f2');
    sellBrand(s);
    s.money = D(1e12);
    unlockFloor(s, 1);
    expect(m2.assignedTo).toBeNull();
    unlockFloor(s, 2);
    expect(m2.assignedTo).toBe('f2');
    expect(s.floors[2].managerId).toBe(m2.id);
    expect(m2.home).toBeNull();
  });

  it('merkt sich die schnellste Zeit bis zur 5. Etage', () => {
    const s = newGame();
    s.money = D(1e12);
    s.stats.playSeconds = 3000;
    for (let i = 1; i < s.floors.length; i++) unlockFloor(s, i);
    expect(s.prestige.bestFloor5).toBe(3000);
    s.stats.totalEarned = D(100 * DIV);
    sellBrand(s);
    s.money = D(1e12);
    s.stats.playSeconds += 1200;
    for (let i = 1; i < s.floors.length; i++) unlockFloor(s, i);
    expect(s.prestige.bestFloor5).toBe(1200);
  });
});

describe('Prestige: Spielstand', () => {
  it('übersteht Speichern und Laden', () => {
    const s = lateGame(50 * DIV);
    giveManager(s, 'floor', 'f4');
    sellBrand(s);
    const back = decodeSave(encodeSave(s));
    expect(back.prestige.crowns).toBe(7);
    expect(back.prestige.runs).toBe(1);
    expect(back.prestige.runStartEarned.eq(s.prestige.runStartEarned)).toBe(true);
    expect(back.managers[0].home).toBe('f4');
  });

  it('migriert einen Spielstand aus Version 1 ohne Fortschrittsverlust', () => {
    const s = createGame(0, 5);
    s.money = D(4242);
    s.stats.totalEarned = D(99999);
    giveManager(s, 'floor', 'f0');
    const plain = toPlain(s) as Record<string, unknown>;
    delete plain.prestige;
    plain.version = 1;
    plain.managers = (plain.managers as Record<string, unknown>[]).map(({ home: _home, ...m }) => m);
    for (const f of plain.floors as Record<string, unknown>[]) delete f.rush;
    const data = JSON.stringify(plain);
    const v1 = { format: 'cocoa-crown-save', version: 1, savedAt: 1, checksum: checksum(data), data };
    const back = decodeSave(v1);
    expect(back.money.eq(4242)).toBe(true);
    expect(back.stats.totalEarned.eq(99999)).toBe(true);
    expect(back.prestige).toMatchObject({ crowns: 0, runs: 0, bestFloor5: null });
    expect(back.managers[0].assignedTo).toBe('f0');
    expect(back.managers[0].home).toBeNull();
    expect(back.floors[0].rush).toBe(0);
  });
});

/**
 * Campaign report: two simulated players sell the brand whenever the 5th floor
 * stands, ten minutes have passed since and the sale at least doubles their
 * crowns. Later runs must reach the 5th floor clearly faster.
 */
function campaign(attentive: boolean, runs: number) {
  const base = attentive ? { seed: 4242, useSkills: true } : { seed: 77, useSkills: false, thinkEvery: 6, catchGolden: false };
  let s = createGame(0, base.seed);
  const result: { f5: number; sell: number; gained: number; crowns: number }[] = [];
  for (let run = 1; run <= runs; run++) {
    let f5: number | null = null;
    s = runBot({
      ...base,
      minutes: 240,
      initial: s,
      stopWhen: (st, t) => {
        if (f5 === null && st.floors[4].unlocked) f5 = t;
        return f5 !== null && t >= f5 + 600 && crownsAvailable(st) >= Math.max(5, st.prestige.crowns);
      },
    }).state;
    const sellAt = s.stats.playSeconds - s.prestige.runStartPlay;
    const gained = sellBrand(s);
    result.push({ f5: f5 ?? Infinity, sell: sellAt, gained, crowns: s.prestige.crowns });
  }
  return result;
}

it('Prestige-Balancing: spätere Durchläufe erreichen die 5. Etage deutlich schneller', () => {
  for (const attentive of [true, false]) {
    const r = campaign(attentive, 3);
    console.log(
      `${attentive ? 'Aufmerksam' : 'Gelegentlich'}:\n` +
        r.map((x, i) => `  Durchlauf ${i + 1}: Etage 5 nach ${(x.f5 / 60).toFixed(1)} min, verkauft nach ${(x.sell / 60).toFixed(1)} min, +${x.gained} Kronen (gesamt ${x.crowns})`).join('\n'),
    );
    expect(r.every((x) => x.gained >= 5)).toBe(true);
    expect(r[1].f5).toBeLessThan(r[0].f5 * 0.75);
    expect(r[2].f5).toBeLessThan(r[1].f5);
  }
}, 600000);
