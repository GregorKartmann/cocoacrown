import { D, Decimal } from '../src/core/num';
import { createGame } from '../src/sim/init';
import { step } from '../src/sim/sim';
import type { GameState, Manager, ManagerBonus, ManagerCategory, SimEvent, StationId } from '../src/sim/types';
import { assignManager } from '../src/sim/actions';

export function newGame(seed = 12345): GameState {
  return createGame(1_700_000_000_000, seed);
}

export function run(s: GameState, seconds: number, dt = 0.05, events: SimEvent[] | null = null): void {
  const n = Math.round(seconds / dt);
  const ctx = { events, offline: false };
  for (let i = 0; i < n; i++) step(s, dt, ctx);
}

/** Inserts a manager with a chosen bonus (bypassing money and RNG) for tests. */
export function giveManager(s: GameState, category: ManagerCategory, station: StationId, bonus: ManagerBonus = 'speed', rarity = 0): Manager {
  const m: Manager = {
    id: `t${s.nextManagerId++}`,
    name: 'Test Person',
    category,
    rarity,
    bonus,
    look: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    assignedTo: null,
    home: null,
    skillActive: 0,
    skillCooldown: 0,
  };
  s.managers.push(m);
  assignManager(s, m.id, station);
  return m;
}

/** A manager that automates without changing any number (bonus never matches). */
export function automateAll(s: GameState): void {
  s.floors.forEach((f, i) => {
    if (f.unlocked && !f.managerId) giveManager(s, 'floor', `f${i}` as StationId, 'cost', 0);
  });
  if (!s.lift.managerId) giveManager(s, 'lift', 'lift', 'cost', 0);
  if (!s.ship.managerId) giveManager(s, 'ship', 'ship', 'cost', 0);
}

export function goodsInSystem(s: GameState): Decimal {
  let total = D(0);
  for (const f of s.floors) total = total.add(f.buffer);
  total = total.add(s.lift.cargo).add(s.ship.depot);
  for (const v of s.ship.vans) total = total.add(v.cargo);
  return total;
}

export function sumEvents(events: SimEvent[], type: SimEvent['type']): Decimal {
  let t = D(0);
  for (const e of events) if (e.type === type && 'value' in e) t = t.add(e.value);
  return t;
}
