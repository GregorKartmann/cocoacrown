/**
 * Kronen-Schatzkammer: permanent start bonuses bought with crowns.
 * Spent crowns keep their income bonus (see config/treasury.ts).
 */
import { TREASURY_BY_ID, type TreasuryId } from '../config/treasury';
import { D } from '../core/num';
import type { GameState } from './types';

export function treasuryRank(s: GameState, id: TreasuryId): number {
  return s.prestige.treasury[id] ?? 0;
}

/** Effect of the bought rank (0 when none). */
export function treasuryValue(s: GameState, id: TreasuryId): number {
  const r = treasuryRank(s, id);
  return r > 0 ? TREASURY_BY_ID[id].values[r - 1] : 0;
}

export function crownsFree(s: GameState): number {
  return Math.max(0, s.prestige.crowns - s.prestige.spent);
}

/** Price of the next rank, or null at the top. */
export function treasuryCost(s: GameState, id: TreasuryId): number | null {
  const b = TREASURY_BY_ID[id];
  const r = treasuryRank(s, id);
  return r < b.costs.length ? b.costs[r] : null;
}

/**
 * Buys the next rank. It also takes effect in the running factory right away
 * (the difference to the old rank), so a bonus bought after a sale helps the
 * new run at once; later sales apply it in full.
 */
export function buyTreasury(s: GameState, id: TreasuryId): boolean {
  const cost = treasuryCost(s, id);
  if (cost === null || crownsFree(s) < cost) return false;
  const before = treasuryValue(s, id);
  s.prestige.spent += cost;
  s.prestige.treasury[id] = treasuryRank(s, id) + 1;
  const after = treasuryValue(s, id);
  switch (id) {
    case 'startkapital':
      s.money = s.money.add(D(after - before));
      break;
    case 'startmanager':
      s.rewards.freeHires += after - before;
      break;
    case 'startetagen':
      for (let i = 0; i < 3; i++) if (s.floors[i].unlocked) s.floors[i].level = Math.max(s.floors[i].level, after);
      break;
    case 'startaufzug':
      s.lift.level = Math.max(s.lift.level, after);
      break;
    case 'startlager':
      s.ship.level = Math.max(s.ship.level, after);
      break;
    default:
      break; // offline time is read when it is needed
  }
  return true;
}

/** Level a floor starts with when it is built (floors 1–3 with Startetagen). */
export function startFloorLevel(s: GameState, i: number): number {
  return i < 3 ? Math.max(1, treasuryValue(s, 'startetagen')) : 1;
}

/** Extra offline seconds from the treasury. */
export function treasuryOfflineSeconds(s: GameState): number {
  return treasuryValue(s, 'offline_zeit') * 3600;
}

/** Applies the start bonuses right after a brand sale reset the factory. */
export function applyRunStart(s: GameState): void {
  const money = treasuryValue(s, 'startkapital');
  if (money > 0) s.money = s.money.add(D(money));
  s.floors[0].level = startFloorLevel(s, 0);
  s.lift.level = Math.max(1, treasuryValue(s, 'startaufzug'));
  s.ship.level = Math.max(1, treasuryValue(s, 'startlager'));
  s.rewards.freeHires += treasuryValue(s, 'startmanager');
}
