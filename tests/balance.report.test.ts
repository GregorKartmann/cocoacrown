import { expect, it } from 'vitest';
import { formatReport, runBot } from './bot';

/**
 * Pacing check against the design targets (GDD, Balancing-Ziele).
 * Two simulated players: an attentive one (uses skills, catches every golden
 * bean, decides every second) and a casual one (decides every 6 s, ignores
 * golden beans and skills). Prints timelines so balancing changes can be
 * reviewed in CI logs.
 */
it('Balancing: aufmerksamer Spieler', () => {
  const r = runBot({ minutes: 120, seed: 4242, useSkills: true });
  console.log(formatReport(r));
  const first = r.firstTime;
  expect(r.purchases.filter((t) => t <= 60).length).toBeGreaterThanOrEqual(4); // Minute 1: mehrere Aktionen
  expect(first['manager:f0']).toBeLessThan(150); // erste Automatisierung
  expect(first['fully-automated']).toBeLessThan(330);
  expect(first['unlock:f1']).toBeLessThan(420);
  expect(first['unlock:f2']).toBeLessThan(1200); // 15 min: mehrere Etagen
  expect(first['unlock:f3']).toBeLessThan(2400);
  expect(first['unlock:f4']).toBeLessThan(4500);
  expect(Math.max(...r.starved.slice(0, 3))).toBeLessThan(120); // nie lange nichts zu tun
});

it('Balancing: gelegentlicher Spieler', () => {
  const r = runBot({ minutes: 150, seed: 77, useSkills: false, thinkEvery: 6, catchGolden: false });
  console.log(formatReport(r));
  const first = r.firstTime;
  expect(first['fully-automated']).toBeLessThan(300);
  expect(first['unlock:f1']).toBeLessThan(600);
  expect(first['unlock:f2']).toBeLessThan(1500);
  expect(first['unlock:f3']).toBeLessThan(3600);
  expect(first['unlock:f4']).toBeLessThan(7200);
  expect(Math.max(...r.starved.slice(0, 3))).toBeLessThan(120);
});
