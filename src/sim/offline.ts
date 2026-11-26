import { treasuryOfflineSeconds } from './treasury';
import { BALANCE } from '../config/balance';
import { D, Decimal } from '../core/num';
import { analyzeFlow, type Stage } from './formulas';
import { R, advanceResearch } from './research';
import { step } from './sim';
import type { GameState, OfflineAccumulator } from './types';

export interface OfflineReport {
  /** Research ranks finished while away. */
  researchDone: string[];
  /** Real time away (s). */
  awaySeconds: number;
  /** Time actually simulated after the cap (s). */
  simulatedSeconds: number;
  capped: boolean;
  earned: Decimal;
  produced: Decimal;
  /** Bottleneck by theory at the end of the absence. */
  bottleneck: Stage;
  /** Share of the time each floor waited on a full storage (0..1). */
  floorStallShare: number[];
  liftBlockedShare: number;
  automated: boolean;
}

/**
 * Catch-up simulation for time spent away. Uses exactly the same step
 * function as live play, only with a coarser step when the absence is long
 * (≤ BALANCE.offline.maxSteps steps). Production, storage limits, lift and van
 * capacities, manager automation and expiring boosts are all honoured; nothing
 * is extrapolated from a "last income per second".
 */
export function simulateOffline(s: GameState, awaySeconds: number): OfflineReport {
  const cfg = BALANCE.offline;
  const away = Math.max(0, awaySeconds);
  // Lagerkapazität research extends the credited time (3 h → up to 12 h).
  const simulated = Math.min(away, offlineCap(s));
  const acc: OfflineAccumulator = {
    earned: D(0),
    produced: D(0),
    floorStallSeconds: s.floors.map(() => 0),
    liftBlockedSeconds: 0,
    liftIdleSeconds: 0,
    vansIdleSeconds: 0,
    researchDone: [],
  };
  if (simulated > 0) {
    const dt = Math.max(BALANCE.dt, simulated / cfg.maxSteps);
    const ctx = { events: null, offline: true, report: acc };
    let remaining = simulated;
    while (remaining > 1e-9) {
      const h = Math.min(dt, remaining);
      step(s, h, ctx);
      remaining -= h;
    }
    s.stats.offlineSeconds += simulated;
  }
  // The lab keeps working for the whole absence, not just the credited part.
  if (away > simulated) advanceResearch(s, away - simulated, { events: null, offline: true, report: acc });
  const automated = s.floors.some((f) => f.unlocked && f.managerId) && !!s.lift.managerId && !!s.ship.managerId;
  return {
    researchDone: acc.researchDone,
    awaySeconds: away,
    simulatedSeconds: simulated,
    capped: away > simulated,
    earned: acc.earned,
    produced: acc.produced,
    bottleneck: analyzeFlow(s).bottleneck,
    floorStallShare: acc.floorStallSeconds.map((x) => (simulated > 0 ? Math.min(1, x / simulated) : 0)),
    liftBlockedShare: simulated > 0 ? Math.min(1, acc.liftBlockedSeconds / simulated) : 0,
    automated,
  };
}

/**
 * Brings the state up to `now` (wall clock, ms). Returns a report when time was
 * credited. Clock going backwards credits nothing. Updating lastWallTime here
 * and saving right after is what prevents a second credit for the same time.
 */
export function catchUp(s: GameState, now: number): OfflineReport | null {
  const elapsed = (now - s.lastWallTime) / 1000;
  s.lastWallTime = now;
  if (!(elapsed > 0)) return null;
  return simulateOffline(s, elapsed);
}

/** Longest absence credited: research (Lagerkapazität) plus the treasury's extra hours. */
export function offlineCap(s: GameState): number {
  return Math.max(BALANCE.offline.maxSeconds, R.offlineSeconds(s)) + treasuryOfflineSeconds(s);
}
