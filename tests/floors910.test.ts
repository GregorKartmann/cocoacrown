import { describe, expect, it } from 'vitest';
import { BALANCE, type FloorDef } from '../src/config/balance';
import { QUESTS } from '../src/config/quests';
import { D } from '../src/core/num';
import { checksum, decodeSave, encodeSave, toPlain } from '../src/save/serialize';
import { sellBrand, unlockFloor } from '../src/sim/actions';
import { bonusCrowns, crownFactorFor, crownsMissingFor, floorStats, oberhausFactor } from '../src/sim/formulas';
import { buyTreasury } from '../src/sim/treasury';
import { newGame } from './helpers';

function topFloors(crowns: number) {
  const s = newGame();
  s.money = D(1e20);
  s.prestige.crowns = crowns;
  for (let i = 1; i < 8; i++) expect(unlockFloor(s, i)).toBe(true);
  return s;
}

describe('Etagen 9 und 10', () => {
  it('sind Skulpturen-Atelier und Schokoladen-Galerie mit Kronen-Siegel', () => {
    const f = BALANCE.floors as readonly FloorDef[];
    expect(f.length).toBe(10);
    expect(f[8].id).toBe('sculptures');
    expect(f[9].id).toBe('gallery');
    expect(f[8].crowns).toBe(750);
    expect(f[9].crowns).toBe(2000);
    expect(f[8].unlockCost).toBe(1e15);
    expect(f[9].unlockCost).toBe(1e18);
    expect(f.slice(5).every((x) => x.costGrowth === 1.18 && x.logistics === 8)).toBe(true);
  });

  it('lassen sich erst mit genug Kronen bauen, Geld allein reicht nicht', () => {
    const s = topFloors(749);
    expect(crownsMissingFor(s, 8)).toBe(1);
    const money = s.money;
    expect(unlockFloor(s, 8)).toBe(false);
    expect(s.money.eq(money)).toBe(true);
    s.prestige.crowns = 750;
    expect(crownsMissingFor(s, 8)).toBe(0);
    expect(unlockFloor(s, 8)).toBe(true);
    expect(oberhausFactor(s)).toBe(8 ** 4);
    expect(unlockFloor(s, 9)).toBe(false);
    s.prestige.crowns = 2000;
    expect(unlockFloor(s, 9)).toBe(true);
    expect(oberhausFactor(s)).toBe(8 ** 5);
    expect(floorStats(s, 9).rate.gt(floorStats(s, 8).rate)).toBe(true);
  });

  it('ausgegebene Kronen zählen für das Siegel weiter', () => {
    const s = topFloors(800);
    s.prestige.runs = 3;
    s.money = D(1e20);
    // spend in the treasury: owned crowns stay, the gate stays open
    for (let i = 0; i < 20; i++) buyTreasury(s, 'startkapital');
    expect(s.prestige.spent).toBeGreaterThan(0);
    expect(crownsMissingFor(s, 8)).toBe(0);
    expect(unlockFloor(s, 8)).toBe(true);
  });

  it('der Kronenbonus wächst bis 100 Kronen linear, danach mit der Wurzel', () => {
    expect(bonusCrowns(50)).toBe(50);
    expect(bonusCrowns(100)).toBe(100);
    expect(bonusCrowns(400)).toBeCloseTo(200, 9);
    expect(bonusCrowns(1000)).toBeCloseTo(316.23, 2);
    expect(crownFactorFor(100)).toBeCloseTo(11, 9);
    expect(crownFactorFor(400)).toBeCloseTo(21, 9);
    // never shrinks
    let last = 0;
    for (let c = 0; c <= 2000; c += 7) {
      const b = bonusCrowns(c);
      expect(b).toBeGreaterThanOrEqual(last);
      last = b;
    }
  });

  it('haben eigene Aufträge', () => {
    expect(QUESTS[QUESTS.length - 2].id).toBe('q-sculptures');
    expect(QUESTS[QUESTS.length - 1].id).toBe('q-gallery');
    const s = topFloors(2000);
    unlockFloor(s, 8);
    expect(QUESTS[QUESTS.length - 2].progress(s)).toBe(1);
    expect(QUESTS[QUESTS.length - 1].progress(s)).toBe(0);
  });

  it('migriert Spielstände aus Version 6: zwei neue, gesperrte Etagen', () => {
    const s = topFloors(120);
    s.prestige.runs = 4;
    const plain = toPlain(s) as Record<string, unknown>;
    plain.floors = (plain.floors as unknown[]).slice(0, 8);
    plain.version = 6;
    const data = JSON.stringify(plain);
    const back = decodeSave({ format: 'cocoa-crown-save', version: 6, savedAt: 1, checksum: checksum(data), data });
    expect(back.floors.length).toBe(10);
    expect(back.floors.slice(0, 8).every((f) => f.unlocked)).toBe(true);
    expect(back.floors.slice(8).every((f) => !f.unlocked && f.level === 1 && f.buffer.eq(0))).toBe(true);
    expect(back.prestige.crowns).toBe(120);
    // and the new floors survive a roundtrip once built
    back.prestige.crowns = 750;
    back.money = D(1e20);
    unlockFloor(back, 8);
    const again = decodeSave(encodeSave(back));
    expect(again.floors[8].unlocked).toBe(true);
    expect(again.floors[9].unlocked).toBe(false);
  });

  it('nach dem Markenverkauf bleibt das Siegel offen', () => {
    const s = topFloors(760);
    unlockFloor(s, 8);
    s.stats.totalEarned = D(1e25);
    s.prestige.runStartEarned = D(0);
    sellBrand(s);
    expect(s.floors[8].unlocked).toBe(false);
    expect(s.prestige.crowns).toBeGreaterThanOrEqual(760);
    expect(crownsMissingFor(s, 8)).toBe(0);
  });
});
