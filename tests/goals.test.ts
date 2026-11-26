import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, DAILY_BY_ID, DAILY_POOL } from '../src/config/goals';
import { D } from '../src/core/num';
import { checksum, decodeSave, encodeSave, toPlain } from '../src/save/serialize';
import { buyUpgrade, catchGolden, hireManager, redeemGoldenBean, sellBrand, unlockFloor } from '../src/sim/actions';
import { managerHireCost } from '../src/sim/formulas';
import {
  bumpDaily,
  claimAchievement,
  claimDaily,
  claimableAchievements,
  dayKey,
  daysBetween,
  eligible,
  refreshDaily,
  secondsToMidnight,
  visibleStreak,
} from '../src/sim/goals';
import type { GameState } from '../src/sim/types';
import { giveManager, newGame } from './helpers';

const DAY = 86400000;
/** 2026-11-25 10:00 in Berlin (UTC+1). */
const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);

function game(): GameState {
  const s = newGame();
  s.daily.tz = 'Europe/Berlin';
  return s;
}

/** Completes all three goals of the current offer. */
function finishDay(s: GameState) {
  let last = null;
  for (const g of s.daily.goals) {
    const t = DAILY_BY_ID[g.id];
    for (let k = 0; k < 400 && g.progress < g.target; k++) last = bumpDaily(s, t.metric, Math.max(1, g.target), `x${k}`);
  }
  return last!;
}

describe('Kalender', () => {
  it('rechnet Tage in der gespeicherten Zeitzone', () => {
    expect(dayKey(T0, 'Europe/Berlin')).toBe('2026-11-25');
    // 23:30 UTC is already the next day in Berlin
    expect(dayKey(Date.UTC(2026, 10, 25, 23, 30), 'Europe/Berlin')).toBe('2026-11-26');
    expect(dayKey(Date.UTC(2026, 10, 25, 23, 30), 'America/New_York')).toBe('2026-11-25');
    expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1);
    expect(secondsToMidnight(T0, 'Europe/Berlin')).toBe(14 * 3600);
  });
});

describe('Erfolge', () => {
  it('sind 114 Stück (seit 0.10.0 mit Platin und Diamant) und lesen dauerhafte Zähler', () => {
    expect(ACHIEVEMENTS.length).toBe(114);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(114);
  });

  it('werden erreicht, einmal abgeholt und geben ihre Belohnung', () => {
    const s = game();
    s.stats.batches = 12;
    expect(claimableAchievements(s).map((a) => a.id)).toEqual(['charges_10']);
    expect(claimAchievement(s, 'charges_10')).toEqual({ kind: 'recipePoints', amount: 1 });
    expect(s.research.points).toBe(1);
    expect(claimAchievement(s, 'charges_10')).toBeNull();
    expect(claimAchievement(s, 'charges_250')).toBeNull();
    s.stats.managersHired = 5;
    claimAchievement(s, 'manager_1');
    claimAchievement(s, 'manager_5');
    expect(s.rewards.freeHires).toBe(1);
    s.stats.goldenCaught = 50;
    claimAchievement(s, 'bean_50');
    expect(s.rewards.goldenBeans).toBe(1);
  });

  it('Rekorde für Maschinenlevel und Etagen bleiben über den Markenverkauf erhalten', () => {
    const s = game();
    s.money = D(1e13);
    for (let i = 0; i < 49; i++) buyUpgrade(s, 'f0', 1);
    for (let i = 1; i < 5; i++) unlockFloor(s, i);
    expect(s.stats.maxFloorLevel).toBe(50);
    expect(s.stats.maxFloors).toBe(5);
    s.stats.totalEarned = D(1e9);
    sellBrand(s);
    expect(s.floors[0].level).toBe(1);
    expect(s.stats.maxFloorLevel).toBe(50);
    expect(s.stats.maxFloors).toBe(5);
    expect(claimableAchievements(s).map((a) => a.id)).toEqual(expect.arrayContaining(['upgrade_10', 'upgrade_50', 'floor_5', 'prestige_1']));
  });
});

describe('Belohnungen', () => {
  it('kostenlose Einstellung kostet nichts und verteuert spätere Einstellungen nicht', () => {
    const s = game();
    s.money = D(0);
    s.rewards.freeHires = 1;
    const price = managerHireCost(s, 'floor');
    const m = hireManager(s, 'floor');
    expect(m).not.toBeNull();
    expect(s.rewards.freeHires).toBe(0);
    expect(managerHireCost(s, 'floor').eq(price)).toBe(true);
    expect(hireManager(s, 'floor')).toBeNull();
  });

  it('eingelöste Goldene Bohne wirkt, zählt aber nicht als gefangen', () => {
    const s = game();
    s.rewards.goldenBeans = 1;
    expect(redeemGoldenBean(s)).not.toBeNull();
    expect(s.rewards.goldenBeans).toBe(0);
    expect(s.stats.goldenCaught).toBe(0);
    expect(redeemGoldenBean(s)).toBeNull();
    expect(catchGolden(s)).toBeNull();
  });
});

describe('Tagesziele', () => {
  it('ziehen pro Tag drei Ziele, je eines pro Bereich, und bleiben bis Mitternacht gleich', () => {
    const s = game();
    expect(refreshDaily(s, T0)).toBe(true);
    expect(s.daily.day).toBe('2026-11-25');
    expect(s.daily.goals.map((g) => DAILY_BY_ID[g.id].slot)).toEqual(['Produktion', 'Logistik', 'Extra']);
    const ids = s.daily.goals.map((g) => g.id);
    expect(refreshDaily(s, T0 + 5 * 3600000)).toBe(false);
    expect(s.daily.goals.map((g) => g.id)).toEqual(ids);
    expect(refreshDaily(s, T0 + DAY)).toBe(true);
    // no repeat the next day as long as alternatives exist
    for (const id of s.daily.goals.map((g) => g.id)) expect(ids).not.toContain(id);
  });

  it('überspringen Ziele, deren Voraussetzung fehlt', () => {
    const s = game();
    expect(eligible(s, DAILY_BY_ID.prod_variety)).toBe(false); // only one floor
    expect(eligible(s, DAILY_BY_ID.flex_skill)).toBe(false); // no manager
    expect(eligible(s, DAILY_BY_ID.prod_manual)).toBe(true);
    giveManager(s, 'floor', 'f0');
    expect(eligible(s, DAILY_BY_ID.prod_manual)).toBe(false); // nothing left to start by hand
    expect(eligible(s, DAILY_BY_ID.flex_skill)).toBe(true);
    for (let d = 0; d < 20; d++) {
      refreshDaily(s, T0 + d * DAY);
      expect(s.daily.goals.some((g) => g.id === 'prod_variety')).toBe(false);
    }
  });

  it('zählen Fortschritt, verschiedene Etagen nur einmal, und geben 2 Rezeptpunkte', () => {
    const s = game();
    s.money = D(1e6);
    unlockFloor(s, 1);
    s.daily.day = '2026-11-25';
    s.daily.goals = [
      { id: 'prod_variety', target: 2, progress: 0, claimed: false },
      { id: 'ship_trips', target: 6, progress: 0, claimed: false },
      { id: 'flex_focus', target: 180, progress: 0, claimed: false },
    ];
    bumpDaily(s, 'distinctActiveBatchFloors', 1, 0);
    bumpDaily(s, 'distinctActiveBatchFloors', 1, 0);
    expect(s.daily.goals[0].progress).toBe(1);
    const b = bumpDaily(s, 'distinctActiveBatchFloors', 1, 1);
    expect(b.completed).toEqual(['prod_variety']);
    expect(claimDaily(s, 1)).toBeNull();
    const before = s.research.points;
    expect(claimDaily(s, 0)).toEqual({ kind: 'recipePoints', amount: 2 });
    expect(s.research.points).toBe(before + 2);
    expect(claimDaily(s, 0)).toBeNull();
  });

  it('Serie: alle drei Ziele an aufeinanderfolgenden Tagen; Tag 3 Manager, Tag 7 Goldene Bohne; Lücke setzt zurück', () => {
    const s = game();
    const rewards: string[] = [];
    for (let d = 0; d < 7; d++) {
      refreshDaily(s, T0 + d * DAY);
      const b = finishDay(s);
      expect(b.dayDone).toBe(true);
      expect(s.daily.streak).toBe(d + 1);
      rewards.push(...b.streakRewards.map((r) => `${d + 1}:${r.kind}`));
    }
    expect(rewards).toEqual(['3:managerHireCredit', '7:goldenBean']);
    expect(s.rewards).toEqual({ freeHires: 1, goldenBeans: 1 });
    expect(visibleStreak(s, T0 + 7 * DAY)).toBe(7);
    // a missed day breaks it
    expect(visibleStreak(s, T0 + 8 * DAY)).toBe(0);
    refreshDaily(s, T0 + 8 * DAY);
    finishDay(s);
    expect(s.daily.streak).toBe(1);
  });

  it('jedes Ziel im Pool hat ein gültiges Ziel und einen Bereich', () => {
    expect(DAILY_POOL.length).toBe(13);
    for (const t of DAILY_POOL) expect(['Produktion', 'Logistik', 'Extra']).toContain(t.slot);
  });
});

describe('Spielstand v4', () => {
  it('übersteht Speichern und Laden', () => {
    const s = game();
    refreshDaily(s, T0);
    bumpDaily(s, 'activeSeconds', 50);
    s.goals.claimed.push('charges_10');
    s.rewards.goldenBeans = 2;
    s.stats.maxFloorLevel = 77;
    const back = decodeSave(encodeSave(s));
    expect(back.daily.day).toBe('2026-11-25');
    expect(back.daily.tz).toBe('Europe/Berlin');
    expect(back.daily.goals.map((g) => g.id)).toEqual(s.daily.goals.map((g) => g.id));
    expect(back.goals.claimed).toEqual(['charges_10']);
    expect(back.rewards.goldenBeans).toBe(2);
    expect(back.stats.maxFloorLevel).toBe(77);
  });

  it('migriert Version 3: Rekorde aus dem laufenden Spiel, Erfolge sofort abholbar', () => {
    const s = game();
    s.money = D(1e9);
    unlockFloor(s, 1);
    unlockFloor(s, 2);
    s.floors[1].level = 60;
    s.stats.batches = 300;
    s.prestige.bestFloor5 = 3000;
    const plain = toPlain(s) as Record<string, unknown>;
    delete plain.goals;
    delete plain.rewards;
    delete plain.daily;
    const st = plain.stats as Record<string, unknown>;
    delete st.maxFloorLevel;
    delete st.maxFloors;
    plain.version = 3;
    const data = JSON.stringify(plain);
    const back = decodeSave({ format: 'cocoa-crown-save', version: 3, savedAt: 1, checksum: checksum(data), data });
    expect(back.stats.maxFloorLevel).toBe(60);
    expect(back.stats.maxFloors).toBe(5);
    expect(back.goals.claimed).toEqual([]);
    expect(back.rewards).toEqual({ freeHires: 0, goldenBeans: 0 });
    expect(claimableAchievements(back).map((a) => a.id)).toEqual(expect.arrayContaining(['charges_10', 'charges_250', 'upgrade_50', 'floor_5']));
  });
});
