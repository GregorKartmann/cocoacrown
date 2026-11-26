import { describe, expect, it } from 'vitest';
import { CONTRACTS, CUSTOMERS, CUSTOMER_BY_ID } from '../src/config/contracts';
import { DAILY_BY_ID } from '../src/config/goals';
import { TREASURY_BY_ID } from '../src/config/treasury';
import { D } from '../src/core/num';
import { checksum, decodeSave, encodeSave, toPlain } from '../src/save/serialize';
import { sellBrand, unlockFloor } from '../src/sim/actions';
import {
  acceptContract,
  cancelContract,
  checkContractsOpen,
  closeContract,
  declineOffer,
  deliverableUnits,
  nextCustomer,
  nice,
  refreshBoard,
} from '../src/sim/contracts';
import { crownFactor } from '../src/sim/formulas';
import { eligible } from '../src/sim/goals';
import { offlineCap, simulateOffline } from '../src/sim/offline';
import { buyTreasury, crownsFree, treasuryCost, treasuryRank } from '../src/sim/treasury';
import type { ContractOffer, GameState, SimEvent } from '../src/sim/types';
import { automateAll, newGame, run } from './helpers';

function twoFloors(seed = 7): GameState {
  const s = newGame(seed);
  s.money = D(1e6);
  unlockFloor(s, 1);
  s.floors[0].level = 20;
  s.floors[1].level = 10;
  s.lift.level = 30;
  s.ship.level = 30;
  automateAll(s);
  s.money = D(0);
  return s;
}

function offer(s: GameState, o: Partial<ContractOffer>): number {
  s.contracts.offers[0] = {
    id: 99,
    customer: 'cafe',
    kind: 'units',
    floor: 0,
    target: D(10),
    seconds: 300,
    pay: D(1234),
    ruf: 1,
    bonus: null,
    ...o,
  };
  return 0;
}

describe('Lieferverträge: Vertragsbrett', () => {
  it('öffnet mit der 2. Etage und füllt drei Angebote vom Café', () => {
    const s = newGame();
    expect(s.contracts.open).toBe(false);
    expect(refreshBoard(s)).toBe(false);
    s.money = D(1e5);
    unlockFloor(s, 1);
    expect(s.contracts.open).toBe(true);
    refreshBoard(s);
    expect(s.contracts.offers.filter(Boolean)).toHaveLength(CONTRACTS.slots);
    expect(s.contracts.offers.every((o) => o!.customer === 'cafe')).toBe(true);
  });

  it('Angebote richten sich nach dem aktuellen Warenfluss', () => {
    const s = twoFloors();
    refreshBoard(s);
    const cafe = CUSTOMER_BY_ID.cafe;
    for (const o of s.contracts.offers) {
      expect(o!.kind).toBe('units');
      expect(o!.seconds).toBeGreaterThanOrEqual(cafe.minutes[0] * 60);
      expect(o!.seconds).toBeLessThanOrEqual(cafe.minutes[1] * 60);
      const flow = deliverableUnits(s, o!.floor).mul(o!.seconds);
      const ratio = o!.target.div(flow).toNumber();
      expect(ratio).toBeGreaterThan(cafe.demand[0] * 0.9);
      expect(ratio).toBeLessThan(cafe.demand[1] * 1.1);
      expect(o!.pay.gte(50)).toBe(true);
    }
  });

  it('runde Zahlen mit zwei gültigen Stellen', () => {
    expect(nice(D(24731)).toNumber()).toBe(25000);
    expect(nice(D(1349)).toNumber()).toBe(1300);
    expect(nice(D(37.4)).toNumber()).toBe(37);
    expect(nice(D('1.234e40')).eq(D('1.2e40'))).toBe(true);
  });

  it('nur ein Vertrag gleichzeitig; leere Plätze füllen sich nach 90 s', () => {
    const s = twoFloors();
    refreshBoard(s);
    expect(acceptContract(s, 0)).not.toBeNull();
    expect(acceptContract(s, 1)).toBeNull();
    expect(s.contracts.offers[0]).toBeNull();
    run(s, CONTRACTS.refill - 1);
    refreshBoard(s);
    expect(s.contracts.offers[0]).toBeNull();
    run(s, 2);
    refreshBoard(s);
    expect(s.contracts.offers[0]).not.toBeNull();
    expect(declineOffer(s, 2)).toBe(true);
    expect(s.contracts.offers[2]).toBeNull();
  });
});

describe('Lieferverträge: Lieferung und Frist', () => {
  it('fertige Chargen der bestellten Etage zählen, pünktlich gibt Geld und Ruf', () => {
    const s = twoFloors();
    s.contracts.open = true;
    acceptContract(s, offer(s, { floor: 1, target: D(30) }));
    const events: SimEvent[] = [];
    run(s, 300, 0.05, events);
    expect(s.contracts.active!.status).toBe('delivered');
    expect(events.some((e) => e.type === 'contractDelivered')).toBe(true);
    const money = s.money;
    const earned = s.stats.totalEarned;
    const p = closeContract(s)!;
    expect(p.pay.eq(1234)).toBe(true);
    expect(s.money.sub(money).eq(1234)).toBe(true);
    expect(s.stats.totalEarned.sub(earned).eq(1234)).toBe(true);
    expect(s.contracts.ruf).toBe(1);
    expect(s.contracts.delivered).toBe(1);
    expect(s.contracts.active).toBeNull();
  });

  it('andere Etagen zählen nicht; nach Ablauf der Frist ist der Vertrag verloren', () => {
    const s = twoFloors();
    s.contracts.open = true;
    acceptContract(s, offer(s, { floor: 2, target: D(1), seconds: 60 }));
    const events: SimEvent[] = [];
    run(s, 61, 0.05, events);
    expect(s.contracts.active!.status).toBe('failed');
    expect(events.some((e) => e.type === 'contractFailed')).toBe(true);
    expect(closeContract(s)).toBeNull();
    expect(s.contracts.failed).toBe(1);
    expect(s.contracts.ruf).toBe(0);
  });

  it('Wertverträge zählen verkaufte Ware in Euro', () => {
    const s = twoFloors();
    s.contracts.open = true;
    acceptContract(s, offer(s, { customer: 'feinkost', kind: 'value', floor: -1, target: D(50) }));
    run(s, 120);
    expect(s.contracts.active!.status).toBe('delivered');
  });

  it('die Frist läuft auch offline weiter, Lieferungen ebenso', () => {
    const s = twoFloors();
    s.contracts.open = true;
    acceptContract(s, offer(s, { floor: 0, target: D(20), seconds: 600 }));
    simulateOffline(s, 300);
    expect(s.contracts.active!.status).toBe('delivered');
    const t = twoFloors();
    t.contracts.open = true;
    acceptContract(t, offer(t, { floor: 0, target: D('1e30'), seconds: 600 }));
    simulateOffline(t, 900);
    expect(t.contracts.active!.status).toBe('failed');
  });

  it('zurückgeben beendet einen laufenden Vertrag ohne Folgen', () => {
    const s = twoFloors();
    s.contracts.open = true;
    acceptContract(s, offer(s, {}));
    expect(cancelContract(s)).toBe(true);
    expect(s.contracts.active).toBeNull();
    expect(s.contracts.failed).toBe(0);
  });

  it('Ruf schaltet die nächsten Kunden frei', () => {
    const s = twoFloors();
    expect(nextCustomer(s)!.id).toBe('konditorei');
    s.contracts.ruf = CUSTOMER_BY_ID.konditorei.ruf;
    expect(nextCustomer(s)!.id).toBe('feinkost');
    s.contracts.ruf = 10000;
    expect(nextCustomer(s)).toBeNull();
    expect(CUSTOMERS.map((c) => c.ruf)).toEqual([...CUSTOMERS.map((c) => c.ruf)].sort((a, b) => a - b));
  });

  it('Bonus-Belohnungen landen im Inventar', () => {
    const s = twoFloors();
    s.contracts.open = true;
    acceptContract(s, offer(s, { target: D(1), bonus: { kind: 'goldenBean', amount: 1 } }));
    run(s, 30);
    closeContract(s);
    expect(s.rewards.goldenBeans).toBe(1);
  });

  it('Markenverkauf: ein gelieferter Vertrag wird noch gutgeschrieben, das Brett startet neu', () => {
    const s = twoFloors();
    for (let i = 2; i < 5; i++) {
      s.money = D(1e12);
      unlockFloor(s, i);
    }
    s.stats.totalEarned = D(1e9);
    acceptContract(s, offer(s, { target: D(1), ruf: 4 }));
    run(s, 30);
    expect(s.contracts.active!.status).toBe('delivered');
    expect(sellBrand(s)).toBeGreaterThan(0);
    expect(s.contracts.ruf).toBe(4);
    expect(s.contracts.active).toBeNull();
    expect(s.contracts.offers.every((o) => o === null)).toBe(true);
    expect(s.contracts.open).toBe(true);
  });

  it('Tagesziel „Liefervertrag“ nur mit offenem Vertragsbrett', () => {
    const s = newGame();
    expect(eligible(s, DAILY_BY_ID.flex_contract)).toBe(false);
    s.contracts.open = true;
    expect(eligible(s, DAILY_BY_ID.flex_contract)).toBe(true);
  });
});

describe('Kronen-Schatzkammer', () => {
  it('Kronen ausgeben behält ihren Einkommensbonus', () => {
    const s = newGame();
    s.prestige.crowns = 20;
    const factor = crownFactor(s);
    const cost = treasuryCost(s, 'startkapital')!;
    expect(buyTreasury(s, 'startkapital')).toBe(true);
    expect(crownsFree(s)).toBe(20 - cost);
    expect(crownFactor(s)).toBe(factor);
    expect(treasuryRank(s, 'startkapital')).toBe(1);
  });

  it('kein Kauf ohne genug freie Kronen und nicht über den höchsten Rang', () => {
    const s = newGame();
    s.prestige.crowns = 2;
    expect(buyTreasury(s, 'startmanager')).toBe(false);
    s.prestige.crowns = 1e6;
    const b = TREASURY_BY_ID.startmanager;
    for (let i = 0; i < b.costs.length; i++) expect(buyTreasury(s, 'startmanager')).toBe(true);
    expect(treasuryCost(s, 'startmanager')).toBeNull();
    expect(buyTreasury(s, 'startmanager')).toBe(false);
    expect(s.prestige.spent).toBe(b.costs.reduce((a, c) => a + c, 0));
  });

  it('nach dem Markenverkauf greifen alle Startboni', () => {
    const s = twoFloors();
    for (let i = 2; i < 5; i++) {
      s.money = D(1e12);
      unlockFloor(s, i);
    }
    s.stats.totalEarned = D(1e9);
    s.prestige.crowns = 1000;
    for (const id of ['startetagen', 'startetagen', 'startkapital', 'startaufzug', 'startlager', 'startmanager'] as const) buyTreasury(s, id);
    s.prestige.crowns = 0;
    s.prestige.spent = 0;
    const hires = s.rewards.freeHires;
    sellBrand(s);
    expect(s.money.eq(TREASURY_BY_ID.startkapital.values[0])).toBe(true);
    expect(s.floors[0].level).toBe(25);
    expect(s.lift.level).toBe(10);
    expect(s.ship.level).toBe(10);
    expect(s.rewards.freeHires).toBe(hires + 1);
    s.money = D(1e12);
    unlockFloor(s, 1);
    unlockFloor(s, 2);
    unlockFloor(s, 3);
    expect(s.floors[1].level).toBe(25);
    expect(s.floors[2].level).toBe(25);
    expect(s.floors[3].level).toBe(1);
  });

  it('ein Rang wirkt sofort im laufenden Werk (nur der Unterschied zum alten Rang)', () => {
    const s = twoFloors();
    s.prestige.crowns = 1000;
    const money = s.money;
    buyTreasury(s, 'startkapital');
    buyTreasury(s, 'startkapital');
    expect(s.money.sub(money).toNumber()).toBe(TREASURY_BY_ID.startkapital.values[1]);
    buyTreasury(s, 'startetagen');
    expect(s.floors[0].level).toBe(20);
    expect(s.floors[1].level).toBe(10);
    buyTreasury(s, 'startetagen');
    expect(s.floors[0].level).toBe(25);
    expect(s.floors[1].level).toBe(25);
    expect(s.floors[2].unlocked).toBe(false);
    buyTreasury(s, 'startaufzug');
    expect(s.lift.level).toBe(30);
    const hires = s.rewards.freeHires;
    buyTreasury(s, 'startmanager');
    expect(s.rewards.freeHires).toBe(hires + 1);
  });

  it('Mehr Offline-Zeit verlängert die Abwesenheit um volle Stunden', () => {
    const s = newGame();
    const base = offlineCap(s);
    s.prestige.crowns = 100;
    buyTreasury(s, 'offline_zeit');
    buyTreasury(s, 'offline_zeit');
    expect(offlineCap(s) - base).toBe(2 * 3600);
  });
});

describe('Spielstand v6', () => {
  it('Verträge und Schatzkammer überstehen Speichern und Laden', () => {
    const s = twoFloors();
    refreshBoard(s);
    acceptContract(s, 1);
    run(s, 10);
    s.contracts.ruf = 17;
    s.prestige.crowns = 50;
    buyTreasury(s, 'startlager');
    buyTreasury(s, 'offline_zeit');
    const back = decodeSave(encodeSave(s));
    expect(JSON.stringify(toPlain(back))).toBe(JSON.stringify(toPlain(s)));
    expect(back.contracts.active!.progress.eq(s.contracts.active!.progress)).toBe(true);
  });

  it('Version 5 ohne Verträge: das Brett öffnet beim Laden, wenn die 2. Etage steht', () => {
    const s = twoFloors();
    const plain = toPlain(s) as Record<string, unknown>;
    delete plain.contracts;
    const pr = plain.prestige as Record<string, unknown>;
    delete pr.spent;
    delete pr.treasury;
    plain.version = 5;
    const data = JSON.stringify(plain);
    const back = decodeSave({ format: 'cocoa-crown-save', version: 5, savedAt: 1, checksum: checksum(data), data });
    expect(back.prestige.spent).toBe(0);
    expect(back.prestige.treasury).toEqual({});
    expect(back.contracts.open).toBe(false);
    expect(checkContractsOpen(back)).toBe(true);
    refreshBoard(back);
    expect(back.contracts.offers.filter(Boolean)).toHaveLength(3);
  });
});
