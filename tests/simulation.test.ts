import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { D, approxEqual } from '../src/core/num';
import { analyzeFlow, floorStats, liftStats, shipStats } from '../src/sim/formulas';
import { activateSkill, catchGolden, tapStation } from '../src/sim/actions';
import { step } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { automateAll, giveManager, goodsInSystem, newGame, run, sumEvents } from './helpers';

describe('Manueller Betrieb', () => {
  it('Ohne Manager produziert eine Etage genau einen Zyklus pro Tipp', () => {
    const s = newGame();
    run(s, 10);
    expect(s.stats.batches).toBe(0);
    expect(tapStation(s, 'f0')).toBe('started');
    run(s, BALANCE.floors[0].baseCycle + 0.1);
    expect(s.stats.batches).toBe(1);
    run(s, 10);
    expect(s.stats.batches).toBe(1);
    expect(s.floors[0].buffer.eq(floorStats(s, 0).batch)).toBe(true);
  });

  it('Tippen auf einen laufenden Zyklus beschleunigt ihn, aber begrenzt', () => {
    const s = newGame();
    tapStation(s, 'f0');
    let effective = 0;
    for (let i = 0; i < 20; i++) if (tapStation(s, 'f0') === 'boosted') effective++;
    expect(effective).toBe(BALANCE.tap.maxPerSecond);
    expect(s.floors[0].progress).toBeCloseTo(BALANCE.tap.boost * BALANCE.tap.maxPerSecond, 6);
  });

  it('Der komplette Kreislauf Tippen → Aufzug → Verkauf erzeugt Geld', () => {
    const s = newGame();
    tapStation(s, 'f0');
    run(s, 3.2);
    expect(tapStation(s, 'lift')).toBe('started');
    run(s, liftStats(s).tripTime + 0.2);
    expect(s.ship.depot.gt(0)).toBe(true);
    expect(tapStation(s, 'ship')).toBe('started');
    run(s, shipStats(s).roundTrip + 0.2);
    expect(s.money.eq(floorStats(s, 0).batch)).toBe(true);
    expect(s.stats.vanTrips).toBe(1);
  });
});

describe('Erhaltung der Ware', () => {
  it('Ware entsteht nur durch Produktion und verschwindet nur durch Verkauf', () => {
    const s = newGame(7);
    s.floors[0].level = 30;
    s.floors[1].unlocked = true;
    s.floors[1].level = 12;
    s.lift.level = 14;
    s.ship.level = 8;
    automateAll(s);
    const events: SimEvent[] = [];
    run(s, 600, 0.05, events);
    const produced = sumEvents(events, 'batch');
    const sold = sumEvents(events, 'sale'); // price factor 1 (no Verhandler)
    expect(approxEqual(produced, goodsInSystem(s).add(sold), 1e-9)).toBe(true);
    expect(approxEqual(sold, s.money, 1e-9)).toBe(true);
  });
});

describe('Engpässe', () => {
  it('Langsamer Aufzug begrenzt das Einkommen auf seine Kapazität', () => {
    const s = newGame();
    s.floors[0].level = 60; // viel Produktion
    s.ship.level = 60; // viel Versand
    automateAll(s);
    run(s, 120); // einschwingen
    const before = s.money;
    run(s, 300);
    const rate = s.money.sub(before).div(300);
    const flow = analyzeFlow(s);
    expect(flow.bottleneck).toBe('lift');
    // Within 10 %: the lift returns early when full, so it can beat the full-trip estimate slightly.
    expect(rate.div(flow.lift).toNumber()).toBeGreaterThan(0.9);
    expect(rate.div(flow.lift).toNumber()).toBeLessThan(1.6);
    expect(s.floors[0].stalled).toBe(true);
  });

  it('Langsamer Versand füllt das Versandlager und blockiert den Aufzug', () => {
    const s = newGame();
    s.floors[0].level = 60;
    s.lift.level = 30;
    automateAll(s);
    run(s, 900);
    const flow = analyzeFlow(s);
    expect(flow.bottleneck).toBe('ship');
    const cap = liftStats(s).depotCap;
    expect(s.ship.depot.div(cap).toNumber()).toBeGreaterThan(0.9);
    const before = s.money;
    run(s, 300);
    const rate = s.money.sub(before).div(300);
    expect(rate.div(flow.ship).toNumber()).toBeGreaterThan(0.95);
    expect(rate.div(flow.ship).toNumber()).toBeLessThan(1.05);
  });

  it('Ist die Produktion der Engpass, wird alles Produzierte verkauft', () => {
    const s = newGame();
    s.lift.level = 40;
    s.ship.level = 40;
    automateAll(s);
    run(s, 60);
    const before = s.money;
    run(s, 300);
    const rate = s.money.sub(before).div(300);
    const flow = analyzeFlow(s);
    expect(flow.bottleneck).toBe('production');
    expect(rate.div(flow.production).toNumber()).toBeGreaterThan(0.97);
    expect(rate.div(flow.production).toNumber()).toBeLessThan(1.03);
  });
});

describe('Manager und Boni', () => {
  it('Ein Manager automatisiert, Taktgeber beschleunigt messbar', () => {
    const a = newGame();
    const b = newGame();
    for (const s of [a, b]) {
      s.lift.level = 40;
      s.ship.level = 40;
    }
    automateAll(a);
    giveManager(b, 'floor', 'f0', 'speed', 1); // selten: +25 %
    giveManager(b, 'lift', 'lift', 'cost', 0);
    giveManager(b, 'ship', 'ship', 'capacity', 0);
    run(a, 400);
    run(b, 400);
    expect(b.stats.batches / a.stats.batches).toBeGreaterThan(1.2);
    expect(b.stats.batches / a.stats.batches).toBeLessThan(1.3);
  });

  it('Aktive Fähigkeit läuft ab und hat eine Abklingzeit', () => {
    const s = newGame();
    const m = giveManager(s, 'floor', 'f0', 'speed', 0);
    const base = floorStats(s, 0).cycle;
    expect(activateSkill(s, m.id)).toBe(true);
    expect(floorStats(s, 0).cycle).toBeCloseTo(base / BALANCE.managers.rarities[0].active, 9);
    expect(activateSkill(s, m.id)).toBe(false);
    run(s, BALANCE.managers.rarities[0].duration + 0.1);
    expect(floorStats(s, 0).cycle).toBeCloseTo(base, 9);
    run(s, BALANCE.managers.skillCooldown);
    expect(activateSkill(s, m.id)).toBe(true);
  });

  it('Verhandler erhöht den Verkaufserlös um seinen Bonus', () => {
    const s = newGame();
    s.floors[0].level = 20;
    s.lift.level = 40;
    s.ship.level = 40;
    automateAll(s);
    const sales: SimEvent[] = [];
    // replace ship manager with a negotiator
    s.ship.managerId = null;
    s.managers.forEach((m) => {
      if (m.assignedTo === 'ship') m.assignedTo = null;
    });
    giveManager(s, 'ship', 'ship', 'price', 2); // +50 %
    run(s, 200, 0.05, sales);
    let goods = D(0);
    for (const e of sales) if (e.type === 'vanDepart') goods = goods.add(e.value);
    const inTransit = s.ship.vans.reduce((t, v) => t.add(v.cargo), D(0));
    expect(approxEqual(s.money, goods.sub(inTransit).mul(1.5), 1e-9)).toBe(true);
  });

  it('Goldene Kakaobohne erscheint, kann gefangen werden und Boosts laufen ab', () => {
    const s = newGame(99);
    run(s, BALANCE.golden.firstSpawn + 0.1);
    expect(s.golden.active).not.toBeNull();
    const reward = catchGolden(s);
    expect(reward).not.toBeNull();
    expect(s.golden.active).toBeNull();
    expect(s.stats.goldenCaught).toBe(1);
    run(s, 120);
    expect(s.boosts.length).toBe(0);
  });

  it('Simulation ist deterministisch und unabhängig von der Schrittweite der Darstellung', () => {
    const mk = () => {
      const s = newGame(5);
      s.floors[0].level = 25;
      s.lift.level = 12;
      s.ship.level = 12;
      automateAll(s);
      return s;
    };
    const a = mk();
    const b = mk();
    run(a, 300, 0.05);
    // b: same fixed step but driven in irregular "frames" like a renderer would
    let acc = 0;
    let steps = 0;
    const frames = [0.016, 0.033, 0.007, 0.1, 0.05, 0.021];
    let k = 0;
    while (steps < 6000) {
      acc += frames[k++ % frames.length];
      while (acc >= BALANCE.dt - 1e-12 && steps < 6000) {
        step(b, BALANCE.dt, { events: null, offline: false });
        acc -= BALANCE.dt;
        steps++;
      }
    }
    expect(b.money.eq(a.money)).toBe(true);
  });
});
