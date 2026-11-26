import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { RESEARCH, RESEARCH_BY_ID } from '../src/config/research';
import { D } from '../src/core/num';
import { checksum, decodeSave, encodeSave, toPlain } from '../src/save/serialize';
import { buyUpgrade, claimQuest, sellBrand, unlockFloor } from '../src/sim/actions';
import { crownFactor, floorStats, liftStats, oberhausFactor, shipStats } from '../src/sim/formulas';
import { simulateOffline } from '../src/sim/offline';
import { R, nextRank, nodeState, startResearch, whyNot } from '../src/sim/research';
import { step } from '../src/sim/sim';
import type { GameState, SimEvent } from '../src/sim/types';
import { newGame } from './helpers';

function withLab(): GameState {
  const s = newGame();
  s.money = D(1e7);
  unlockFloor(s, 1);
  unlockFloor(s, 2);
  return s;
}

describe('Rezeptlabor: Punkte', () => {
  it('gibt Punkte für Meilensteine, neue Etagen und Aufträge – nie für Geld', () => {
    const s = newGame();
    s.money = D(1e9);
    expect(s.research.points).toBe(0);
    for (let i = 0; i < 9; i++) buyUpgrade(s, 'f0', 1); // level 1 → 10: one milestone
    expect(s.research.points).toBe(1);
    buyUpgrade(s, 'f0', 1); // 10 → 11: none
    expect(s.research.points).toBe(1);
    buyUpgrade(s, 'lift', 10); // lift 1 → 11: milestone 10 (bulk buy)
    expect(s.research.points).toBe(2);
    unlockFloor(s, 1);
    expect(s.research.points).toBe(3);
    s.stats.batches = 1;
    expect(claimQuest(s)).toBeGreaterThan(0);
    expect(s.research.points).toBe(4);
    expect(s.research.earned).toBe(4);
  });

  it('öffnet das Labor mit der 3. Etage, auch nach dem Markenverkauf bleibt es offen', () => {
    const s = newGame();
    s.money = D(1e7);
    expect(whyNot(s, 'schnellere_zyklen')).toBe('closed');
    unlockFloor(s, 1);
    expect(s.research.open).toBe(false);
    unlockFloor(s, 2);
    expect(s.research.open).toBe(true);
    s.prestige.bestFloor5 = 100;
    s.stats.totalEarned = D(1e9);
    sellBrand(s);
    expect(s.research.open).toBe(true);
  });
});

describe('Rezeptlabor: Forschen', () => {
  it('kostet Punkte, läuft eine feste Zeit und hebt dann den Rang', () => {
    const s = withLab();
    s.research.points = 10;
    const nr = nextRank(s, 'schnellere_zyklen')!;
    expect(nr).toEqual({ rank: 1, cost: 1, duration: 120 });
    expect(startResearch(s, 'schnellere_zyklen')).toBe(true);
    expect(s.research.points).toBe(9);
    expect(nodeState(s, 'schnellere_zyklen')).toBe('aktiv');
    expect(whyNot(s, 'verkaufsstellen')).toBe('busy');
    const events: SimEvent[] = [];
    for (let i = 0; i < Math.round(119 / BALANCE.dt); i++) step(s, BALANCE.dt, { events, offline: false });
    expect(s.research.ranks.schnellere_zyklen).toBe(0);
    for (let i = 0; i < Math.round(2 / BALANCE.dt); i++) step(s, BALANCE.dt, { events, offline: false });
    expect(s.research.ranks.schnellere_zyklen).toBe(1);
    expect(s.research.active).toBeNull();
    expect(events.some((e) => e.type === 'researchDone' && e.id === 'schnellere_zyklen' && e.rank === 1)).toBe(true);
  });

  it('respektiert Voraussetzungen, Punkte und Maximalrang', () => {
    const s = withLab();
    s.research.points = 0;
    expect(whyNot(s, 'schnellere_zyklen')).toBe('points');
    expect(whyNot(s, 'waermefuehrung')).toBe('locked');
    s.research.ranks.schnellere_zyklen = 2;
    s.research.points = 100;
    expect(whyNot(s, 'waermefuehrung')).toBeNull();
    s.research.ranks.chargengroesse = RESEARCH_BY_ID.chargengroesse.maxRank;
    expect(whyNot(s, 'chargengroesse')).toBe('max');
    expect(nodeState(s, 'chargengroesse')).toBe('maximal');
  });

  it('läuft während der ganzen Abwesenheit weiter, auch über die Offline-Grenze hinaus', () => {
    const s = withLab();
    s.research.ranks.schnellere_zyklen = 2;
    s.research.points = 100;
    s.research.ranks.waermefuehrung = 4;
    startResearch(s, 'waermefuehrung'); // rank 5: 3600 s
    const r = simulateOffline(s, 10 * 3600);
    expect(r.simulatedSeconds).toBe(3 * 3600);
    expect(s.research.ranks.waermefuehrung).toBe(5);
    expect(r.researchDone).toEqual(['waermefuehrung']);
  });

  it('Rezeptentwicklung verkürzt die Dauer', () => {
    const s = withLab();
    s.research.ranks.rezeptentwicklung = 5;
    expect(nextRank(s, 'verkaufsstellen')!.duration).toBe(Math.round(120 * 0.6));
  });

  it('bleibt beim Markenverkauf erhalten, inklusive laufender Forschung', () => {
    const s = withLab();
    s.research.points = 20;
    s.research.ranks.verkaufsstellen = 3;
    startResearch(s, 'lieferflotte');
    s.prestige.bestFloor5 = 100;
    s.stats.totalEarned = D(1e9);
    sellBrand(s);
    expect(s.research.ranks.verkaufsstellen).toBe(3);
    expect(s.research.active?.id).toBe('lieferflotte');
    expect(s.research.points).toBe(19 + 3); // brand sale bonus
  });
});

describe('Rezeptlabor: Wirkungen', () => {
  it('wirken auf Tempo, Ware, Lager, Logistik, Preis, Kronen, Offline-Zeit und Premium-Etagen', () => {
    const s = withLab();
    const cycle = floorStats(s, 0).cycle;
    const batch = floorStats(s, 0).batch;
    const cap = floorStats(s, 0).bufferCap;
    const price = shipStats(s).priceFactor;
    const shipCap = shipStats(s).capacity;
    const lift = liftStats(s).floorTime;
    s.prestige.crowns = 10;
    const crowns = crownFactor(s);
    s.research.ranks = { ...s.research.ranks, schnellere_zyklen: 5, chargengroesse: 2, lagerkapazitaet: 5, lieferflotte: 5, routenplanung: 2, verkaufsstellen: 5, markensiegel: 5 };
    expect(floorStats(s, 0).cycle).toBeCloseTo(cycle / 1.3, 6);
    expect(floorStats(s, 0).batch.div(batch).toNumber()).toBeCloseTo(1.5, 6);
    expect(floorStats(s, 0).bufferCap.div(cap).toNumber()).toBeCloseTo(1.5 * 2.5, 6);
    expect(shipStats(s).capacity.div(shipCap).toNumber()).toBeCloseTo(1.5, 6);
    expect(liftStats(s).floorTime).toBeCloseTo(lift / 1.3, 6);
    expect(crownFactor(s)).toBeCloseTo(1 + 10 * 0.15, 9);
    expect(crowns).toBeCloseTo(2, 9);
    expect(shipStats(s).priceFactor / price).toBeCloseTo(1.3 * 2.5, 6);
    expect(R.offlineSeconds(s)).toBe(12 * 3600);
    // Premiumsortiment only touches floors 6–8
    s.research.ranks.premiumsortiment = 2;
    expect(R.premium(s, 4)).toBe(1);
    expect(R.premium(s, 5)).toBeCloseTo(1.6, 9);
  });

  it('kennt 12 Forschungen in 4 Zweigen, jede mit Kosten und Dauer pro Rang', () => {
    expect(RESEARCH.length).toBe(12);
    for (const n of RESEARCH) {
      expect(n.cost.length).toBe(n.maxRank);
      expect(n.duration.length).toBe(n.maxRank);
    }
  });
});

describe('Etagen 6–8 (Oberhaus)', () => {
  it('jede gebaute Oberhaus-Etage vergrößert Aufzug und Lieferwagen um ×8', () => {
    const s = newGame();
    s.money = D(1e14);
    for (let i = 1; i < 5; i++) unlockFloor(s, i);
    const lift = liftStats(s).capacity;
    const ship = shipStats(s).capacity;
    expect(oberhausFactor(s)).toBe(1);
    unlockFloor(s, 5);
    expect(oberhausFactor(s)).toBe(8);
    expect(liftStats(s).capacity.div(lift).toNumber()).toBeCloseTo(8, 9);
    expect(shipStats(s).capacity.div(ship).toNumber()).toBeCloseTo(8, 9);
    unlockFloor(s, 6);
    unlockFloor(s, 7);
    expect(oberhausFactor(s)).toBe(512);
    expect(s.floors.slice(0, 8).every((f) => f.unlocked)).toBe(true);
  });

  it('migriert Spielstände aus Version 2: drei neue, gesperrte Etagen und ein Startguthaben an Rezeptpunkten', () => {
    const s = newGame();
    s.money = D(1e9);
    unlockFloor(s, 1);
    unlockFloor(s, 2);
    for (let i = 0; i < 24; i++) buyUpgrade(s, 'f0', 1); // milestones 10 and 25
    s.quest.index = 6;
    const plain = toPlain(s) as Record<string, unknown>;
    plain.floors = (plain.floors as unknown[]).slice(0, 5);
    delete plain.research;
    plain.version = 2;
    const data = JSON.stringify(plain);
    const back = decodeSave({ format: 'cocoa-crown-save', version: 2, savedAt: 1, checksum: checksum(data), data });
    expect(back.floors.length).toBe(10);
    expect(back.floors.slice(5).every((f) => !f.unlocked && f.level === 1)).toBe(true);
    expect(back.research.open).toBe(true);
    // 3 floors + 2 floor milestones + 6 quests
    expect(back.research.points).toBe(3 + 2 + 6);
    expect(back.money.eq(s.money)).toBe(true);
  });

  it('Forschung übersteht Speichern und Laden', () => {
    const s = withLab();
    s.research.points = 9;
    s.research.ranks.markensiegel = 2;
    s.research.ranks.verkaufsstellen = 2;
    startResearch(s, 'markensiegel');
    const back = decodeSave(encodeSave(s));
    expect(back.research.ranks.markensiegel).toBe(2);
    expect(back.research.active?.id).toBe('markensiegel');
    expect(back.research.points).toBe(s.research.points);
    expect(back.research.open).toBe(true);
  });
});
