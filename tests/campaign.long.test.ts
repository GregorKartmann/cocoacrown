/**
 * Long campaign (opt-in: LONG_CAMPAIGN=1 npx vitest run tests/campaign.long.test.ts).
 *
 * A simulated player plays run after run for up to ~30 hours of active play:
 * contracts on, research on, treasury bought cheapest-first after every sale.
 * Selling rule: the 5th floor stands for 10 minutes and the sale lifts the crown
 * factor by ×1.5 – or by ×1.2 after two hours – or it opens floor 9/10.
 * Prints when floors 8, 9 and 10 first stand and how long the runs take.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE, type FloorDef } from '../src/config/balance';
import { TREASURY } from '../src/config/treasury';
import { sellBrand } from '../src/sim/actions';
import { analyzeFlow, crownFactorFor, crownsAvailable, prestigeUnlocked } from '../src/sim/formulas';
import { createGame } from '../src/sim/init';
import { buyTreasury, treasuryCost } from '../src/sim/treasury';
import type { GameState } from '../src/sim/types';
import { runBot } from './bot';

const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const HOURS = Number(ENV.CAMPAIGN_HOURS ?? 30);
const RULE = ENV.SELL_RULE ?? 'ratio';
// quick tuning: override balance values, e.g. TUNE='prestige.tailRoot=6,floors.8.unlockCost=1e16'
for (const kv of (ENV.TUNE ?? '').split(',').filter(Boolean)) {
  const [path, v] = kv.split('=');
  const keys = path.split('.');
  let o = BALANCE as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys[keys.length - 1]] = Number(v);
}

function spendTreasury(s: GameState) {
  for (let guard = 0; guard < 200; guard++) {
    let best: { id: (typeof TREASURY)[number]['id']; cost: number } | null = null;
    for (const t of TREASURY) {
      const c = treasuryCost(s, t.id);
      if (c !== null && (!best || c < best.cost)) best = { id: t.id, cost: c };
    }
    if (!best || !buyTreasury(s, best.id)) return;
  }
}

function gatedNeed(s: GameState): number {
  const i = s.floors.findIndex((f) => !f.unlocked);
  if (i < 0) return 0;
  return (BALANCE.floors[i] as FloorDef).crowns ?? 0;
}

export function longCampaign(attentive: boolean, hours: number) {
  const base = attentive ? { seed: 4242, useSkills: true } : { seed: 77, useSkills: false, thinkEvery: 6, catchGolden: false };
  let s = createGame(0, base.seed);
  let total = 0;
  const first: Record<string, number> = {};
  const runs: { min: number; floors: number; gained: number; crowns: number; bottleneck: string; flow: string; levels: string }[] = [];
  while (total < hours * 3600 && runs.length < 80) {
    let f5: number | null = null;
    let bestRate = 0;
    let bestAt = 0;
    const res = runBot({
      ...base,
      minutes: 300,
      initial: s,
      contracts: true,
      saveForFloor: Number(ENV.SAVE_FOR ?? 2400),
      stopWhen: (st, t) => {
        st.floors.forEach((f, i) => {
          const k = `f${i + 1}`;
          if (f.unlocked && first[k] === undefined) first[k] = total + t;
        });
        if (f5 === null && st.floors[4].unlocked) f5 = t;
        if (f5 === null || !prestigeUnlocked(st)) return false;
        const now = st.prestige.crowns;
        const gain = crownsAvailable(st);
        if (gain < 1) return false;
        const need = gatedNeed(st);
        const allMoneyFloorsBuilt = st.floors.every((f, i) => f.unlocked || ((BALANCE.floors[i] as FloorDef).crowns ?? 0) > now);
        if (need > now && allMoneyFloorsBuilt && now + gain >= need && t >= f5 + 300) return true;
        const ratio = crownFactorFor(now + gain, st) / crownFactorFor(now, st);
        if (RULE === 'rate') {
          // a sharp player: sell once the bonus gained per minute has clearly peaked
          const rate = Math.log(ratio) / t;
          if (rate > bestRate) {
            bestRate = rate;
            bestAt = t;
          }
          return t >= f5 + 600 && ratio >= 1.1 && rate < bestRate * 0.85 && t >= bestAt + 300;
        }
        if (RULE === 'short') {
          // a player who sells about once an hour
          if (t >= f5 + 600 && ratio >= 1.3) return true;
          return t >= 3600 && ratio >= 1.1;
        }
        if (t >= f5 + 600 && ratio >= 1.5) return true;
        if (t >= 7200 && ratio >= 1.2) return true;
        return false;
      },
    });
    s = res.state;
    const runSec = s.stats.playSeconds - s.prestige.runStartPlay;
    total += runSec;
    const fl = analyzeFlow(s);
    const flow = `P ${fl.production.toExponential(1)} L ${fl.lift.toExponential(1)} V ${fl.ship.toExponential(1)}`;
    const floors = s.floors.filter((f) => f.unlocked).length;
    const levels = s.floors.filter((f) => f.unlocked).map((f) => f.level).join('/') + ` A${s.lift.level} V${s.ship.level}`;
    const gained = prestigeUnlocked(s) ? sellBrand(s) : 0;
    spendTreasury(s);
    runs.push({ min: runSec / 60, floors, gained, crowns: s.prestige.crowns, bottleneck: fl.bottleneck, flow: `${flow} Σ${s.stats.totalEarned.toExponential(1)} @${(total / 3600).toFixed(1)}h`, levels });
  }
  return { runs, first, total };
}

describe.skipIf(!ENV.LONG_CAMPAIGN)('Langzeit-Kampagne', () => {
  for (const attentive of [true, false]) {
    it(attentive ? 'aufmerksam' : 'gelegentlich', () => {
      const t0 = Date.now();
      const r = longCampaign(attentive, HOURS);
      const h = (x?: number) => (x === undefined ? '–' : `${(x / 3600).toFixed(1)} h`);
      console.log(
        `${attentive ? 'Aufmerksam' : 'Gelegentlich'} (${((Date.now() - t0) / 1000).toFixed(0)} s Rechenzeit, ${h(r.total)} gespielt)\n` +
          `  Etage 6 ${h(r.first.f6)} · Etage 8 ${h(r.first.f8)} · Etage 9 ${h(r.first.f9)} · Etage 10 ${h(r.first.f10)}\n` +
          r.runs
            .map((x, i) => `  ${String(i + 1).padStart(2)}: ${x.min.toFixed(0).padStart(4)} min, ${x.floors} Et., +${x.gained} → ${x.crowns} Kronen, ${x.bottleneck} (${x.flow}) ${x.levels}`)
            .join('\n'),
      );
      expect(r.runs.length).toBeGreaterThan(0);
    }, 3_600_000);
  }
});
