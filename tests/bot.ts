import { BALANCE } from '../src/config/balance';
import { QUESTS } from '../src/config/quests';
import { Decimal } from '../src/core/num';
import { formatNumber } from '../src/core/format';
import {
  activateSkill,
  assignManager,
  buyUpgrade,
  catchGolden,
  claimQuest,
  currentQuest,
  hireManager,
  nextLockedFloor,
  quoteUpgrade,
  tapStation,
  unlockFloor,
} from '../src/sim/actions';
import { analyzeFlow, floorStatsAt, floorUnlockCost, managerHireCost } from '../src/sim/formulas';
import { createGame } from '../src/sim/init';
import { step } from '../src/sim/sim';
import type { GameState, StationId } from '../src/sim/types';

/**
 * Headless "player" used to tune pacing. It plays like an attentive casual
 * player: taps idle stations, hires managers when affordable, invests in the
 * option with the best income gain per euro and catches golden beans.
 */
export interface BotOptions {
  minutes: number;
  seed?: number;
  useSkills?: boolean;
  catchGolden?: boolean;
  /** Seconds between decisions (player attention). */
  thinkEvery?: number;
  /** Continue an existing game (e.g. after a brand sale) instead of starting fresh. */
  initial?: GameState;
  /** Stop early once this returns true (t = seconds since this run started). */
  stopWhen?: (s: GameState, t: number) => boolean;
}

export interface BotEvent {
  t: number;
  what: string;
}

export interface BotResult {
  state: GameState;
  events: BotEvent[];
  samples: { t: number; income: number; money: number; earned: number; bottleneck: string; levels: string }[];
  purchases: number[];
  firstTime: Record<string, number>;
  incomeAt: (t: number) => number;
  questReady: Record<string, number>;
  /** Longest stretch (s) in which nothing at all was affordable, per window. */
  starved: number[];
}

type Option = { kind: 'upgrade'; station: StationId } | { kind: 'unlock'; floor: number };

export function runBot(opts: BotOptions): BotResult {
  const s = opts.initial ?? createGame(0, opts.seed ?? 4242);
  const t0 = s.simTime;
  const events: BotEvent[] = [];
  const samples: BotResult['samples'] = [];
  const purchases: number[] = [];
  const firstTime: Record<string, number> = {};
  const mark = (key: string, t: number) => {
    if (firstTime[key] === undefined) {
      firstTime[key] = t;
      events.push({ t, what: key });
    }
  };
  const ctx = { events: null, offline: false };
  const think = opts.thinkEvery ?? 1;
  const total = opts.minutes * 60;
  let nextThink = 0;
  let nextSample = 0;
  const steps = Math.round(total / BALANCE.dt);
  const incomeLog: { t: number; v: number }[] = [];
  const questReady: Record<string, number> = {};
  const starvedSpans: { from: number; to: number }[] = [];
  let starvedFrom: number | null = null;

  for (let k = 0; k < steps; k++) {
    step(s, BALANCE.dt, ctx);
    const t = s.simTime - t0;
    if (opts.catchGolden !== false && s.golden.active && s.golden.active.remaining < BALANCE.golden.lifetime - 2) {
      const r = catchGolden(s);
      if (r) mark('golden', t);
    }
    if (t + 1e-9 < nextThink) continue;
    nextThink = t + think;
    if (opts.stopWhen?.(s, t)) break;
    if (incomeLog.length === 0 || t - incomeLog[incomeLog.length - 1].t >= 5) incomeLog.push({ t, v: analyzeFlow(s).income.toNumber() });
    for (const q of QUESTS) if (questReady[q.id] === undefined && q.progress(s) >= q.target) questReady[q.id] = t;
    {
      const any =
        ['lift', 'ship', ...s.floors.map((f, i) => (f.unlocked ? `f${i}` : null)).filter(Boolean)].some((st) => quoteUpgrade(s, st as StationId, 1).affordable) ||
        (nextLockedFloor(s) !== null && s.money.gte(floorUnlockCost(nextLockedFloor(s) as number)));
      if (!any && starvedFrom === null) starvedFrom = t;
      if (any && starvedFrom !== null) {
        starvedSpans.push({ from: starvedFrom, to: t });
        starvedFrom = null;
      }
    }

    // Taps on idle, non-automated stations
    s.floors.forEach((f, i) => {
      if (f.unlocked && !f.managerId && !f.running) tapStation(s, `f${i}` as StationId);
    });
    if (!s.lift.managerId && s.lift.phase === 'idle') tapStation(s, 'lift');
    if (!s.ship.managerId) tapStation(s, 'ship');

    // Quests
    let q = currentQuest(s);
    while (q && q.done) {
      claimQuest(s);
      mark(`quest:${q.def.id}`, t);
      q = currentQuest(s);
    }

    // Skills
    const cq = currentQuest(s);
    if (opts.useSkills || cq?.def.id === 'q-skill') for (const m of s.managers) if (m.assignedTo && m.skillCooldown <= 0) activateSkill(s, m.id);

    // Managers for unmanaged stations (cheapest category first)
    const unmanaged: StationId[] = [];
    s.floors.forEach((f, i) => f.unlocked && !f.managerId && unmanaged.push(`f${i}` as StationId));
    if (!s.lift.managerId) unmanaged.push('lift');
    if (!s.ship.managerId) unmanaged.push('ship');
    for (const st of unmanaged) {
      const cat = st === 'lift' ? 'lift' : st === 'ship' ? 'ship' : 'floor';
      if (s.money.gte(managerHireCost(s, cat))) {
        const m = hireManager(s, cat);
        if (m) {
          assignManager(s, m.id, st);
          purchases.push(t);
          mark(`manager:${st}`, t);
        }
      }
    }
    if (s.floors[0].managerId && s.lift.managerId && s.ship.managerId) mark('fully-automated', t);

    // Investments: repeat while something good is affordable
    for (let guard = 0; guard < 50; guard++) {
      const base = analyzeFlow(s).income;
      const opts2: { o: Option; gain: Decimal; cost: Decimal }[] = [];
      const stations: StationId[] = ['lift', 'ship'];
      s.floors.forEach((f, i) => f.unlocked && stations.push(`f${i}` as StationId));
      for (const st of stations) {
        const qu = quoteUpgrade(s, st, 1);
        if (qu.atMax) continue;
        // Relaxed gain: a stage's improvement counts up to 50 % above the next
        // tightest stage, so near-ties between production, lift and vans don't stall the bot.
        const stageRate = (f: ReturnType<typeof analyzeFlow>) => (st === 'lift' ? f.lift : st === 'ship' ? f.ship : f.production);
        const othersMin = (f: ReturnType<typeof analyzeFlow>) =>
          st === 'lift' ? Decimal.min(f.production, f.ship) : st === 'ship' ? Decimal.min(f.production, f.lift) : Decimal.min(f.lift, f.ship);
        const fa = analyzeFlow(s);
        adjust(s, st, +1);
        const fb = analyzeFlow(s);
        adjust(s, st, -1);
        const cap = othersMin(fa).mul(1.5);
        const gain = Decimal.min(stageRate(fb), cap).sub(Decimal.min(stageRate(fa), cap)).mul(fa.priceFactor).max(0);
        opts2.push({ o: { kind: 'upgrade', station: st }, gain, cost: qu.cost });
      }
      const lock = nextLockedFloor(s);
      if (lock !== null && s.money.gte(floorUnlockCost(lock))) {
        // Players build a new floor as soon as they can afford it.
        unlockFloor(s, lock);
        purchases.push(t);
        mark(`unlock:f${lock}`, t);
        continue;
      }
      if (lock !== null) {
        // A new floor is valued at its own production (players love new floors).
        const rate = floorStatsAt(s, lock, 1).rate;
        opts2.push({ o: { kind: 'unlock', floor: lock }, gain: rate, cost: floorUnlockCost(lock) });
      }
      let best: (typeof opts2)[number] | null = null;
      let bestScore = -1;
      for (const c of opts2) {
        const score = c.gain.div(c.cost).toNumber();
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (!best || bestScore <= 0) {
        // Tied bottleneck (e.g. lift = vans): a single upgrade shows no gain, so buy the cheapest tied stage.
        const f = analyzeFlow(s);
        const min = f.income.div(f.priceFactor);
        const tied: StationId[] = [];
        if (f.lift.lte(min.mul(1.001))) tied.push('lift');
        if (f.ship.lte(min.mul(1.001))) tied.push('ship');
        const cands = tied.map((st) => ({ st, q: quoteUpgrade(s, st, 1) })).filter((c) => c.q.affordable);
        cands.sort((a, b) => (a.q.cost.lt(b.q.cost) ? -1 : 1));
        if (cands.length && buyUpgrade(s, cands[0].st, 1)) {
          purchases.push(t);
          continue;
        }
        break;
      }
      // Saving up: when the next floor is within ~8 minutes of income, only small purchases.
      if (lock !== null) {
        const unlock = floorUnlockCost(lock);
        const secs = unlock.sub(s.money).div(base.max(1e-9)).toNumber();
        if (secs < 480 && best.o.kind === 'upgrade' && best.cost.gt(unlock.mul(0.02))) break;
      }
      let pick = best;
      if (s.money.lt(best.cost)) {
        // settle for an affordable option that is at least half as efficient
        const alt = opts2.filter((c) => s.money.gte(c.cost) && c.gain.div(c.cost).toNumber() >= bestScore * 0.5);
        if (!alt.length) break;
        alt.sort((a, b) => b.gain.div(b.cost).toNumber() - a.gain.div(a.cost).toNumber());
        pick = alt[0];
      }
      if (pick.o.kind === 'upgrade') {
        if (buyUpgrade(s, pick.o.station, 1)) {
          purchases.push(t);
          const lvl = pick.o.station === 'lift' ? s.lift.level : pick.o.station === 'ship' ? s.ship.level : s.floors[Number(pick.o.station.slice(1))].level;
          for (const m of [10, 25, 50, 100]) if (lvl === m) mark(`${pick.o.station}@${m}`, t);
        } else break;
      } else {
        if (unlockFloor(s, pick.o.floor)) {
          purchases.push(t);
          mark(`unlock:f${pick.o.floor}`, t);
        } else break;
      }
    }

    if (t >= nextSample) {
      nextSample += 300;
      const f = analyzeFlow(s);
      samples.push({
        t,
        income: f.income.toNumber(),
        money: s.money.toNumber(),
        earned: s.stats.totalEarned.sub(s.prestige.runStartEarned).toNumber(),
        bottleneck: f.bottleneck,
        levels: `${s.floors.map((x) => (x.unlocked ? x.level : '-')).join('/')} L${s.lift.level} V${s.ship.level}`,
      });
    }
  }
  const incomeAt = (t: number) => {
    let v = 0;
    for (const x of incomeLog) if (x.t <= t + 1) v = x.v;
    return v;
  };
  const starved = [
    [0, 300],
    [300, 900],
    [900, 3600],
    [3600, 7200],
  ].map(([a, b]) => starvedSpans.filter((x) => x.from >= a && x.from < b).reduce((m, x) => Math.max(m, x.to - x.from), 0));
  return { state: s, events, samples, purchases, firstTime, incomeAt, questReady, starved };
}

function adjust(s: GameState, st: StationId, d: number) {
  if (st === 'lift') s.lift.level += d;
  else if (st === 'ship') s.ship.level += d;
  else s.floors[Number(st.slice(1))].level += d;
}

export function longestGap(purchases: number[], from: number, to: number): number {
  const p = purchases.filter((t) => t >= from && t <= to);
  let gap = 0;
  let prev = from;
  for (const t of p) {
    gap = Math.max(gap, t - prev);
    prev = t;
  }
  return Math.max(gap, to - prev);
}

export function formatReport(r: BotResult): string {
  const lines: string[] = [];
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  lines.push('— Meilensteine —');
  for (const e of r.events) if (!e.what.startsWith('quest') && !/@(10|25)$/.test(e.what)) lines.push(`${mmss(e.t).padStart(6)}  ${e.what}`);
  lines.push('Quests: ' + r.events.filter((e) => e.what.startsWith('quest')).map((e) => `${e.what.slice(8)} ${mmss(e.t)}`).join(', '));
  lines.push('— Verlauf —');
  for (const smp of r.samples)
    lines.push(`${mmss(smp.t).padStart(6)}  ${formatNumber(smp.income).padStart(12)} €/s  ${smp.bottleneck.padEnd(10)} ${smp.levels}`);
  lines.push(`Quests abgeschlossen: ${r.state.quest.index}/${QUESTS.length}`);
  const sugg = [...QUESTS]
    .sort((a, b) => (r.questReady[a.id] ?? 1e9) - (r.questReady[b.id] ?? 1e9))
    .map((q) => {
      const t = r.questReady[q.id];
      if (t === undefined) return `${q.id}: -`;
      const smp = r.incomeAt(t);
      return `${q.id} bereit@${mmss(t)} inc ${formatNumber(smp)} → 40s=${formatNumber(smp * 40)} (jetzt ${formatNumber(q.reward)})`;
    });
  lines.push('Nichts bezahlbar (max. s): ' + r.starved.map((x) => Math.round(x)).join(' | '));
  lines.push('Belohnungen:\n  ' + sugg.join('\n  '));
  return lines.join('\n');
}
