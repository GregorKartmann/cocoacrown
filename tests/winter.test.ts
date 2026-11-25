import { afterEach, describe, expect, it } from 'vitest';
import { DOORS, LAST_DOOR, SHOP, WINTER_FLOORS, WINTER_MANAGER_NAME } from '../src/config/winter';
import { portraitKey } from '../src/config/content';
import { checksum, decodeSave, encodeSave, toPlain } from '../src/save/serialize';
import {
  adventPhase,
  advanceWinter,
  batchStars,
  buildWinterFloor,
  buyShopItem,
  claimDoor,
  creditWinterAbsence,
  dailyGoalStars,
  doorState,
  doorsWaiting,
  floorAuto,
  hasPerk,
  openDoor,
  ownedDecor,
  seasonEnd,
  shopPrice,
  shopStock,
  starsPerSecond,
  syncSeason,
  tapWinterFloor,
  upgradeCost,
  upgradeWinterFloor,
  visibleDecor,
  type AdventPhase,
} from '../src/sim/winter';
import type { GameState } from '../src/sim/types';
import { newGame } from './helpers';

/** Local wall clock (the test machine's time zone) as ms. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

function season(day: number): { s: GameState; p: AdventPhase } {
  const s = newGame();
  const p = adventPhase(at(2026, 12, day));
  syncSeason(s, p);
  return { s, p };
}

function collect(s: GameState, p: AdventPhase, upTo: number) {
  for (let d = 1; d <= upTo; d++) {
    openDoor(s, d, p);
    claimDoor(s, d, p);
  }
}

/** Node's env (the time zone is read on every Date call). */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const savedTz = env.TZ;
afterEach(() => {
  if (savedTz === undefined) delete env.TZ;
  else env.TZ = savedTz;
});

describe('Adventskalender: Datum auf dem Gerät', () => {
  it('kennt Vorschau, Adventszeit, Ende und die Zeit dazwischen', () => {
    expect(adventPhase(at(2026, 11, 25)).kind).toBe('preview');
    expect(adventPhase(at(2026, 11, 30, 23, 59)).kind).toBe('preview');
    expect(adventPhase(at(2026, 12, 1, 0, 0))).toMatchObject({ kind: 'active', day: 1, season: 2026 });
    expect(adventPhase(at(2026, 12, 24, 18))).toMatchObject({ kind: 'active', day: 24 });
    expect(adventPhase(at(2026, 12, 26, 23, 59))).toMatchObject({ kind: 'active', day: 26 });
    expect(adventPhase(at(2026, 12, 27, 0, 0)).kind).toBe('ended');
    expect(adventPhase(at(2027, 1, 3)).kind).toBe('off');
    expect(adventPhase(at(2027, 10, 31)).kind).toBe('off');
    expect(seasonEnd(2026)).toBe(at(2026, 12, 27, 0, 0));
  });

  it('der 1. Dezember beginnt um Mitternacht Ortszeit', () => {
    // 30 Nov 2026, 11:30 UTC = 1 Dec 00:30 in Auckland, 30 Nov 03:30 in Los Angeles
    const t = Date.UTC(2026, 10, 30, 11, 30);
    env.TZ = 'Pacific/Auckland';
    expect(adventPhase(t)).toMatchObject({ kind: 'active', day: 1 });
    env.TZ = 'America/Los_Angeles';
    expect(adventPhase(t).kind).toBe('preview');
    env.TZ = 'Europe/Berlin';
    expect(adventPhase(Date.UTC(2026, 10, 30, 23, 0))).toMatchObject({ kind: 'active', day: 1 });
    expect(adventPhase(Date.UTC(2026, 10, 30, 22, 59)).kind).toBe('preview');
  });

  it('jedes Türchen 1–24 schaltet etwas Neues frei, 25 und 26 sind Bonus', () => {
    expect(DOORS.map((d) => d.day)).toEqual(Array.from({ length: LAST_DOOR }, (_, i) => i + 1));
    const seen = new Set<string>();
    for (const d of DOORS.slice(0, 24)) {
      expect(d.rewards.length).toBeGreaterThan(0);
      for (const r of d.rewards) if (r.kind === 'perk' || r.kind === 'decor') {
        const key = `${r.kind}:${'perk' in r ? r.perk : r.decor}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });
});

describe('Türchen', () => {
  it('sind in der Vorschau alle zu und öffnen ab ihrem Tag, verpasste bleiben offen', () => {
    const pre = adventPhase(at(2026, 11, 28));
    const s = newGame();
    syncSeason(s, pre);
    expect(doorState(s, 1, pre)).toBe('locked');
    expect(openDoor(s, 1, pre)).toBe(false);

    const { s: s6, p } = season(6);
    expect(doorState(s6, 6, p)).toBe('available');
    expect(doorState(s6, 7, p)).toBe('locked');
    expect(doorsWaiting(s6, p)).toBe(6);
    expect(openDoor(s6, 7, p)).toBe(false);
    expect(openDoor(s6, 2, p)).toBe(true);
    expect(doorState(s6, 2, p)).toBe('open');
    expect(claimDoor(s6, 2, p)).not.toBeNull();
    expect(doorState(s6, 2, p)).toBe('claimed');
    expect(claimDoor(s6, 2, p)).toBeNull();
    expect(doorsWaiting(s6, p)).toBe(5);
  });

  it('Türchen 1 öffnet den Wintermarkt und gibt Zimtsterne', () => {
    const { s, p } = season(1);
    collect(s, p, 1);
    expect(hasPerk(s, 'markt')).toBe(true);
    expect(s.winter.stars).toBe(50);
  });

  it('Türchen 6 bringt Nikolaus Lebkuchner als legendären Manager mit eigenem Porträt', () => {
    const { s, p } = season(6);
    collect(s, p, 6);
    const m = s.managers.find((x) => x.name === WINTER_MANAGER_NAME)!;
    expect(m).toBeDefined();
    expect(m.category).toBe('floor');
    expect(m.rarity).toBe(3);
    expect(m.bonus).toBe('yield');
    expect(portraitKey(m.name, m.category, m.look.hair)).toBe('winter/figuren/weihnachtsmanager_portrait');
  });

  it('Belohnungen für die Kakao-Manufaktur landen im Inventar und im Labor', () => {
    const { s, p } = season(24);
    const rp = s.research.points;
    collect(s, p, 24);
    expect(s.rewards.goldenBeans).toBe(1 + 2 + 3);
    expect(s.rewards.freeHires).toBe(1);
    expect(s.research.points - rp).toBe(3 + 5 + 8 + 10);
    expect(ownedDecor(s).size).toBe(6);
  });

  it('nach dem 26. Dezember lässt sich nichts mehr öffnen', () => {
    const { s } = season(20);
    const end = adventPhase(at(2026, 12, 27, 9));
    expect(doorState(s, 21, end)).toBe('locked');
    expect(openDoor(s, 21, end)).toBe(false);
  });
});

describe('Lebkuchen-Manufaktur', () => {
  it('backt per Tippen eine Charge und wartet dann', () => {
    const { s, p } = season(1);
    expect(tapWinterFloor(s, 0, p)).toBe('started');
    advanceWinter(s, WINTER_FLOORS[0].cycle + 0.01);
    expect(s.winter.stars).toBe(batchStars(s, 0));
    expect(s.winter.floors[0].running).toBe(false);
    advanceWinter(s, 60);
    expect(s.winter.stars).toBe(batchStars(s, 0));
  });

  it('Tippen während der Charge beschleunigt sie', () => {
    const { s, p } = season(1);
    tapWinterFloor(s, 0, p);
    expect(tapWinterFloor(s, 0, p)).toBe('boosted');
    expect(s.winter.floors[0].progress).toBeGreaterThan(0.1);
  });

  it('mit dem Ofenwichtel (Türchen 3) backt die Bäckerei allein, auch während man weg ist', () => {
    const { s, p } = season(3);
    collect(s, p, 3);
    expect(floorAuto(s, 0)).toBe(true);
    advanceWinter(s, 30);
    expect(s.winter.stars).toBe(50 + 10 * batchStars(s, 0));
    const before = s.winter.stars;
    const now = at(2026, 12, 3, 20);
    creditWinterAbsence(s, now - 10 * 3600 * 1000, now); // 10 h away, 2 h count
    expect(s.winter.stars - before).toBeCloseTo((2 * 3600 * batchStars(s, 0)) / WINTER_FLOORS[0].cycle, -1);
  });

  it('zählt Abwesenheit nur bis zum Ende des Events', () => {
    const { s, p } = season(26);
    collect(s, p, 26);
    const before = s.winter.stars;
    const end = seasonEnd(2026);
    creditWinterAbsence(s, end - 3600 * 1000, end + 5 * 3600 * 1000);
    const perHour = (starsPerSecond(s, true) * 3600);
    expect(s.winter.stars - before).toBeLessThanOrEqual(perHour * 1.01);
  });

  it('neue Etagen brauchen ihr Türchen und Zimtsterne', () => {
    const { s, p } = season(4);
    s.winter.stars = 10000;
    expect(buildWinterFloor(s, 1, p)).toBe(false);
    collect(s, p, 4);
    expect(buildWinterFloor(s, 1, p)).toBe(true);
    expect(buildWinterFloor(s, 2, p)).toBe(false);
  });

  it('Ausbau kostet Zimtsterne und verdoppelt alle 25 Stufen', () => {
    const { s, p } = season(1);
    s.winter.stars = 1e9;
    const c1 = upgradeCost(s, 0);
    expect(upgradeWinterFloor(s, 0, p)).toBe(true);
    expect(upgradeCost(s, 0)).toBeGreaterThan(c1);
    s.winter.floors[0].level = 24;
    const b24 = batchStars(s, 0);
    s.winter.floors[0].level = 25;
    expect(batchStars(s, 0)).toBe(Math.round((b24 / 24) * 25 * 2));
  });
});

describe('Wintermarkt', () => {
  it('ist ab Türchen 1 offen, jede Ware einmal am Tag, Preise steigen, Anzahl begrenzt', () => {
    const { s, p } = season(2);
    s.winter.stars = 1e12;
    expect(buyShopItem(s, 'bean', p)).toBeNull();
    collect(s, p, 1);
    const bean = SHOP.find((x) => x.id === 'bean')!;
    expect(shopPrice(s, bean)).toBe(bean.price);
    expect(buyShopItem(s, 'bean', p)).not.toBeNull();
    expect(shopStock(s, bean, p)).toBe('today');
    expect(buyShopItem(s, 'bean', p)).toBeNull();
    expect(shopPrice(s, bean)).toBe(Math.round(bean.price * bean.growth));
    for (let day = 3; day <= 26; day++) buyShopItem(s, 'bean', adventPhase(at(2026, 12, day)));
    expect(s.rewards.goldenBeans).toBe(bean.max);
    expect(shopStock(s, bean, adventPhase(at(2026, 12, 21)))).toBe('soldOut');
  });

  it('Tagesziele bringen ab Türchen 13 zusätzlich Zimtsterne', () => {
    const { s, p } = season(13);
    expect(dailyGoalStars(s, p)).toBe(0);
    collect(s, p, 13);
    expect(dailyGoalStars(s, p)).toBeGreaterThanOrEqual(150);
  });
});

describe('Saison', () => {
  it('eine neue Saison beginnt frisch, Nikolaus bleibt und kommt kein zweites Mal', () => {
    const { s, p } = season(10);
    collect(s, p, 10);
    s.winter.stars = 999;
    const next = adventPhase(at(2027, 11, 20));
    expect(syncSeason(s, next)).toBe(true);
    expect(s.winter.season).toBe(2027);
    expect(s.winter.stars).toBe(0);
    expect(s.winter.claimed).toEqual([]);
    expect(s.managers.filter((m) => m.name === WINTER_MANAGER_NAME)).toHaveLength(1);
    const dec = adventPhase(at(2027, 12, 6));
    const hires = s.rewards.freeHires;
    collect(s, dec, 6);
    expect(s.managers.filter((m) => m.name === WINTER_MANAGER_NAME)).toHaveLength(1);
    expect(s.rewards.freeHires).toBe(hires + 1);
  });

  it('Winterdeko nur im Dezember und nur mit Einstellung', () => {
    const { s, p } = season(22);
    collect(s, p, 22);
    expect(visibleDecor(s, p).size).toBe(6);
    s.settings.winterDecor = false;
    expect(visibleDecor(s, p).size).toBe(0);
    s.settings.winterDecor = true;
    expect(visibleDecor(s, adventPhase(at(2027, 1, 2))).size).toBe(0);
  });
});

describe('Spielstand v5', () => {
  it('übersteht Speichern und Laden', () => {
    const { s, p } = season(8);
    collect(s, p, 8);
    s.winter.stars = 1234.5;
    s.winter.floors[0].level = 33;
    buildWinterFloor(s, 1, p);
    s.winter.shop.bean = 2;
    openDoor(s, 7, p);
    s.settings.winterDecor = false;
    const back = decodeSave(encodeSave(s));
    expect(back.winter).toEqual(s.winter);
    expect(back.settings.winterDecor).toBe(false);
  });

  it('migriert Version 4 ohne Winterdaten', () => {
    const s = newGame();
    const plain = toPlain(s) as Record<string, unknown>;
    delete plain.winter;
    delete (plain.settings as Record<string, unknown>).winterDecor;
    plain.version = 4;
    const data = JSON.stringify(plain);
    const back = decodeSave({ format: 'cocoa-crown-save', version: 4, savedAt: 1, checksum: checksum(data), data });
    expect(back.winter.season).toBe(0);
    expect(back.winter.floors.map((f) => f.built)).toEqual([true, false, false]);
    expect(back.settings.winterDecor).toBe(true);
    syncSeason(back, adventPhase(at(2026, 11, 25)));
    expect(back.winter.season).toBe(2026);
  });
});
