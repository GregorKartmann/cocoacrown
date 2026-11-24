import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { D, approxEqual } from '../src/core/num';
import { analyzeFlow } from '../src/sim/formulas';
import { catchUp, simulateOffline } from '../src/sim/offline';
import { checksum, decodeSave, encodeSave, fromPlain, toPlain } from '../src/save/serialize';
import { migrate } from '../src/save/migrations';
import { SaveManager, exportSaveText, importSaveText, indexedDbBackend, type SaveBackend } from '../src/save/storage';
import { activateSkill, catchGolden, hireManager } from '../src/sim/actions';
import { automateAll, giveManager, newGame, run } from './helpers';

function midGame(seed = 3) {
  const s = newGame(seed);
  s.floors[0].level = 45;
  s.floors[1].unlocked = true;
  s.floors[1].level = 30;
  s.floors[2].unlocked = true;
  s.floors[2].level = 12;
  s.lift.level = 38;
  s.ship.level = 33;
  automateAll(s);
  return s;
}

describe('Offline-Progression', () => {
  it('Offline-Ertrag entspricht der Live-Simulation (kurze Abwesenheit, identische Schritte)', () => {
    const a = midGame();
    const b = midGame();
    run(a, 600);
    const rep = simulateOffline(b, 600);
    expect(b.money.eq(a.money)).toBe(true);
    expect(rep.earned.eq(a.money)).toBe(true);
  });

  it('Lange Abwesenheit mit größerer Schrittweite weicht weniger als 2 % ab', () => {
    const a = midGame();
    const b = midGame();
    const seconds = BALANCE.offline.maxSeconds;
    run(a, seconds);
    const t0 = performance.now();
    simulateOffline(b, seconds);
    const ms = performance.now() - t0;
    const diff = Math.abs(b.money.div(a.money).toNumber() - 1);
    expect(diff).toBeLessThan(0.02);
    expect(ms).toBeLessThan(1500);
  });

  it('Offline wird nicht pauschal hochgerechnet: Engpässe und Lagergrenzen gelten', () => {
    const s = newGame();
    s.floors[0].level = 80; // starke Produktion, schwache Logistik
    automateAll(s);
    const flow = analyzeFlow(s);
    const rep = simulateOffline(s, 3600);
    const naive = flow.production.mul(3600);
    expect(rep.earned.lt(naive.mul(0.05))).toBe(true);
    expect(approxEqual(rep.earned.div(3600), flow.income, 0.15)).toBe(true);
    expect(rep.floorStallShare[0]).toBeGreaterThan(0.9);
  });

  it('Ohne Manager läuft offline nichts weiter (außer laufenden Vorgängen)', () => {
    const s = newGame();
    s.floors[0].level = 20;
    const rep = simulateOffline(s, 3600);
    expect(rep.earned.eq(0)).toBe(true);
    expect(rep.automated).toBe(false);
  });

  it('Abwesenheit wird auf die maximale Offline-Dauer begrenzt', () => {
    const s = midGame();
    const rep = simulateOffline(s, 48 * 3600);
    expect(rep.capped).toBe(true);
    expect(rep.simulatedSeconds).toBe(BALANCE.offline.maxSeconds);
  });

  it('Boni laufen während der Abwesenheit regulär ab', () => {
    const s = midGame();
    const m = giveManager(s, 'floor', 'f3', 'speed', 0);
    s.floors[3].unlocked = true;
    m.assignedTo = 'f3';
    s.floors[3].managerId = m.id;
    activateSkill(s, m.id);
    simulateOffline(s, 3600);
    expect(m.skillActive).toBe(0);
    expect(m.skillCooldown).toBe(0);
  });

  it('Keine doppelte Gutschrift: zweiter Catch-up mit gleicher Uhrzeit bringt nichts', () => {
    const s = midGame();
    const t0 = s.lastWallTime;
    const first = catchUp(s, t0 + 1800 * 1000);
    expect(first?.earned.gt(0)).toBe(true);
    const money = s.money;
    const second = catchUp(s, t0 + 1800 * 1000);
    expect(second).toBeNull();
    expect(s.money.eq(money)).toBe(true);
  });

  it('Zurückgestellte Uhr schreibt nichts gut', () => {
    const s = midGame();
    const money = s.money;
    expect(catchUp(s, s.lastWallTime - 3600 * 1000)).toBeNull();
    expect(s.money.eq(money)).toBe(true);
  });
});

describe('Spielstände', () => {
  it('Speichern und Laden ergibt einen identischen Zustand', () => {
    const s = midGame();
    s.money = D('1.234e512');
    hireManager(s, 'floor');
    run(s, 77);
    catchGolden(s);
    const env = encodeSave(s);
    const back = decodeSave(JSON.parse(JSON.stringify(env)));
    expect(JSON.stringify(toPlain(back))).toBe(JSON.stringify(toPlain(s)));
  });

  it('Simulation läuft nach dem Laden exakt gleich weiter', () => {
    const a = midGame();
    run(a, 50);
    const b = decodeSave(encodeSave(a));
    run(a, 200);
    run(b, 200);
    expect(b.money.eq(a.money)).toBe(true);
  });

  it('Beschädigte Spielstände werden erkannt', () => {
    const env = encodeSave(midGame());
    const broken = { ...env, data: env.data.replace('"level":45', '"level":46') };
    expect(() => decodeSave(broken)).toThrow(/Prüfsumme/);
    const truncated = { ...env, data: env.data.slice(0, 100) };
    truncated.checksum = checksum(truncated.data);
    expect(() => decodeSave(truncated)).toThrow();
  });

  it('Ungültige Werte werden abgelehnt oder geklemmt', () => {
    const plain = toPlain(midGame()) as Record<string, any>;
    plain.floors[0].level = 99999;
    expect(fromPlain(plain).floors[0].level).toBe(BALANCE.floor.maxLevel);
    plain.money = 'abc';
    expect(() => fromPlain(plain)).toThrow();
  });

  it('Inkonsistente Manager-Zuweisungen werden repariert', () => {
    const plain = toPlain(midGame()) as Record<string, any>;
    plain.lift.managerId = plain.floors[0].managerId; // same manager twice
    const s = fromPlain(plain);
    expect(s.lift.managerId).toBeNull();
    expect(s.floors[0].managerId).not.toBeNull();
  });

  it('Migrationen laufen nacheinander und schlagen bei Lücken fehl', () => {
    const migs = {
      1: (d: Record<string, unknown>) => ({ ...d, a: 1 }),
      2: (d: Record<string, unknown>) => ({ ...d, b: (d.a as number) + 1 }),
    };
    expect(migrate({}, 1, 3, migs)).toEqual({ a: 1, b: 2 });
    expect(() => migrate({}, 0, 3, migs)).toThrow();
  });

  it('Export und Import als Datei', () => {
    const s = midGame();
    const text = exportSaveText(s);
    const back = importSaveText(text);
    expect(back.floors[2].level).toBe(12);
    expect(() => importSaveText('kein json')).toThrow();
  });

  it('IndexedDB: Hauptslot beschädigt → Sicherung wird geladen', async () => {
    const mgr = new SaveManager(indexedDbBackend());
    const s = midGame();
    await mgr.save(s);
    s.floors[0].level = 46;
    await mgr.save(s);
    const ok = await mgr.load();
    expect(ok.source).toBe('main');
    expect(ok.state?.floors[0].level).toBe(46);
    // corrupt main slot
    const { createStore, set } = await import('idb-keyval');
    await set('save-main', { format: 'cocoa-crown-save', data: '{}', checksum: 'x' }, createStore('cocoa-crown', 'saves'));
    const fallback = await new SaveManager(indexedDbBackend()).load();
    expect(fallback.source).toBe('backup');
    expect(fallback.state?.floors[0].level).toBe(45);
    expect(fallback.error).toMatch(/Prüfsumme/);
  });

  it('Speichervorgänge werden in Reihenfolge geschrieben', async () => {
    const writes: number[] = [];
    const backend: SaveBackend = {
      read: async () => undefined,
      writeMany: async (entries) => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        const env = entries[0][1] as { savedAt: number };
        writes.push(env.savedAt);
      },
      remove: async () => undefined,
    };
    const mgr = new SaveManager(backend);
    const s = midGame();
    await Promise.all([1, 2, 3, 4, 5].map((t) => mgr.save(s, t)));
    expect(writes).toEqual([1, 2, 3, 4, 5]);
  });
});
