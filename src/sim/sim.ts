import { noteProduced, noteSold, tickContract } from './contracts';
import { BALANCE } from '../config/balance';
import { D, dmin } from '../core/num';
import { floorStats, liftStats, shipStats, unlockedFloorCount } from './formulas';
import { R, advanceResearch } from './research';
import { nextRandom } from './rng';
import type { GameState, SimContext } from './types';

const EPS = 1e-9;

/**
 * Advances the economy by `dt` seconds. Pure state mutation, no rendering, no
 * wall clock. Order inside a step: timers → floors → lift → vans → bonus events.
 * Lift and vans are event-driven inside the step, so even large offline steps
 * hit every stop, departure and sale exactly once.
 */
export function step(s: GameState, dt: number, ctx: SimContext): void {
  s.simTime += dt;
  if (!ctx.offline) s.stats.playSeconds += dt;

  tickTimers(s, dt, ctx);
  for (let i = 0; i < s.floors.length; i++) {
    const f = s.floors[i];
    floorAdvance(s, i, dt + payRush(f, dt), ctx);
    if (!f.running || f.stalled) f.rush = 0;
  }
  liftAdvance(s, dt + payRush(s.lift, dt), ctx);
  if (s.lift.phase === 'idle') s.lift.rush = 0;
  shipAdvance(s, dt + payRush(s.ship, dt), ctx);
  if (!s.ship.vans.some((v) => v.phase !== 'dock')) s.ship.rush = 0;
  if (!ctx.offline) goldenAdvance(s, dt, ctx);
  advanceResearch(s, dt, ctx);
  tickContract(s, dt, ctx);
}

/** Extra seconds a station runs this step from tap time it has earned (smooth, at most maxSpeed×). */
function payRush(st: { rush: number }, dt: number): number {
  if (st.rush <= 0) return 0;
  const extra = Math.min(st.rush, dt * (BALANCE.tap.maxSpeed - 1));
  st.rush -= extra;
  return extra;
}

function refill(budget: number, dt: number): number {
  return Math.min(BALANCE.tap.maxPerSecond, budget + BALANCE.tap.maxPerSecond * dt);
}

function tickTimers(s: GameState, dt: number, ctx: SimContext): void {
  for (const m of s.managers) {
    if (m.skillActive > 0) {
      m.skillActive = Math.max(0, m.skillActive - dt);
      if (m.skillActive === 0) ctx.events?.push({ type: 'skillEnd', managerId: m.id });
    }
    if (m.skillCooldown > 0) m.skillCooldown = Math.max(0, m.skillCooldown - dt);
  }
  if (s.boosts.length) {
    for (const b of s.boosts) b.remaining -= dt;
    const ended = s.boosts.filter((b) => b.remaining <= 0);
    if (ended.length) {
      s.boosts = s.boosts.filter((b) => b.remaining > 0);
      for (const b of ended) ctx.events?.push({ type: 'boostEnd', kind: b.kind });
    }
  }
  for (const f of s.floors) f.tapBudget = refill(f.tapBudget, dt);
  s.lift.tapBudget = refill(s.lift.tapBudget, dt);
  s.ship.tapBudget = refill(s.ship.tapBudget, dt);
}

/* ------------------------------------------------------------------------- */
/* Floors                                                                     */
/* ------------------------------------------------------------------------- */

export function floorAdvance(s: GameState, i: number, dt: number, ctx: SimContext): void {
  const f = s.floors[i];
  if (!f.unlocked) return;
  const auto = f.managerId !== null;
  if (!f.running) {
    if (!auto) return;
    f.running = true;
  }
  const st = floorStats(s, i);
  f.progress += dt / st.cycle;
  let guard = 0;
  while (f.progress >= 1 - EPS && guard++ < 10000) {
    const after = f.buffer.add(st.batch);
    if (after.lte(st.bufferCap.mul(1 + EPS))) {
      f.buffer = after;
      f.progress = Math.max(0, f.progress - 1);
      f.stalled = false;
      s.stats.batches += 1;
      ctx.events?.push({ type: 'batch', floor: i, value: st.batch });
      noteProduced(s, i, st.unitsPerCycle, ctx);
      if (ctx.report) ctx.report.produced = ctx.report.produced.add(st.batch);
      if (!auto) {
        f.running = false;
        f.progress = 0;
        break;
      }
    } else {
      // Storage full: the finished batch waits on the machine.
      f.progress = 1;
      if (!f.stalled) f.stalled = true;
      if (ctx.report) ctx.report.floorStallSeconds[i] += dt;
      break;
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Lift                                                                       */
/* ------------------------------------------------------------------------- */

function anyGoodsWaiting(s: GameState): boolean {
  for (const f of s.floors) if (f.unlocked && f.buffer.gt(0)) return true;
  return false;
}

export function liftAdvance(s: GameState, dt: number, ctx: SimContext): void {
  const L = s.lift;
  const st = liftStats(s);
  const top = unlockedFloorCount(s);
  const auto = L.managerId !== null;
  let t = dt;
  let guard = 0;
  while (t > EPS && guard++ < 1000) {
    switch (L.phase) {
      case 'idle': {
        if ((auto || L.request) && anyGoodsWaiting(s)) {
          L.request = false;
          L.phase = 'up';
          continue;
        }
        if (ctx.report) ctx.report.liftIdleSeconds += t;
        t = 0;
        break;
      }
      case 'up': {
        const next = Math.min(top, Math.floor(L.pos + EPS) + 1);
        const need = Math.max(0, (next - L.pos) * st.floorTime);
        if (need <= t) {
          t -= need;
          L.pos = next;
          // Arrive at floor `next` (1-based) and load.
          const f = s.floors[next - 1];
          const space = st.capacity.sub(L.cargo);
          const take = space.gt(0) ? dmin(f.buffer, space) : D(0);
          if (take.gt(0)) {
            f.buffer = f.buffer.sub(take);
            if (f.buffer.lt(0)) f.buffer = D(0);
            L.cargo = L.cargo.add(take);
            ctx.events?.push({ type: 'liftLoad', floor: next - 1, value: take });
            L.phase = 'stop';
            L.timer = st.dwell;
          } else if (next >= top) {
            L.phase = 'down';
          }
        } else {
          L.pos += t / st.floorTime;
          t = 0;
        }
        break;
      }
      case 'stop': {
        if (L.timer <= t) {
          t -= L.timer;
          L.timer = 0;
          const full = L.cargo.gte(st.capacity.mul(1 - 1e-6));
          L.phase = full || L.pos >= top - EPS ? 'down' : 'up';
        } else {
          L.timer -= t;
          t = 0;
        }
        break;
      }
      case 'down': {
        const need = L.pos * st.floorTime;
        if (need <= t) {
          t -= need;
          L.pos = 0;
          L.phase = 'unload';
          L.timer = st.unload;
        } else {
          L.pos -= t / st.floorTime;
          t = 0;
        }
        break;
      }
      case 'unload': {
        if (L.timer <= t) {
          t -= L.timer;
          L.timer = 0;
          const space = st.depotCap.sub(s.ship.depot);
          const put = space.gt(0) ? dmin(L.cargo, space) : D(0);
          if (put.gt(0)) {
            s.ship.depot = s.ship.depot.add(put);
            L.cargo = L.cargo.sub(put);
            ctx.events?.push({ type: 'liftUnload', value: put });
          }
          if (L.cargo.gt(0)) {
            // Depot full: wait and retry.
            L.blocked = true;
            L.timer = 0.25;
            if (ctx.report) ctx.report.liftBlockedSeconds += Math.min(t, 0.25);
          } else {
            L.cargo = D(0);
            L.blocked = false;
            L.phase = 'idle';
            s.stats.liftTrips += 1;
          }
        } else {
          L.timer -= t;
          t = 0;
        }
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Shipping                                                                   */
/* ------------------------------------------------------------------------- */

export function shipAdvance(s: GameState, dt: number, ctx: SimContext): void {
  const S = s.ship;
  const st = shipStats(s);
  while (S.vans.length < st.vans) S.vans.push({ phase: 'dock', timer: 0, cargo: D(0) });
  const auto = S.managerId !== null;
  const half = st.roundTrip / 2;
  const interval = st.dispatchInterval;
  let request = S.request;
  S.request = false;

  // Event loop inside the step: departures happen at the exact moment a van
  // is back at the dock (no waiting for the next step), staggered by
  // roundTrip / vans when a manager dispatches.
  let rem = dt;
  let guard = 0;
  while (guard++ < 10000) {
    // 1) dispatch what may leave right now
    for (let v = 0; v < S.vans.length; v++) {
      const van = S.vans[v];
      if (van.phase !== 'dock' || S.depot.lte(0)) continue;
      let allowed = request;
      if (!allowed && auto && S.sinceDispatch >= interval - EPS) {
        allowed = true;
        S.sinceDispatch -= interval;
      }
      if (!allowed) continue;
      const load = dmin(S.depot, st.perVan);
      S.depot = S.depot.sub(load);
      if (S.depot.lt(0)) S.depot = D(0);
      van.cargo = load;
      van.phase = 'out';
      van.timer = half;
      ctx.events?.push({ type: 'vanDepart', van: v, value: load });
    }
    request = false;
    if (rem <= EPS) break;

    // 2) time until the next event
    let next = rem;
    let waiting = false;
    for (const van of S.vans) {
      if (van.phase !== 'dock') next = Math.min(next, van.timer);
      else if (S.depot.gt(0)) waiting = true;
    }
    if (auto && waiting && S.sinceDispatch < interval) next = Math.min(next, interval - S.sinceDispatch);
    if (ctx.report && S.vans.every((v) => v.phase === 'dock') && S.depot.lte(0)) ctx.report.vansIdleSeconds += next;

    // 3) advance
    rem -= next;
    S.sinceDispatch = Math.min(interval, S.sinceDispatch + next);
    for (let v = 0; v < S.vans.length; v++) {
      const van = S.vans[v];
      if (van.phase === 'dock') continue;
      van.timer -= next;
      if (van.timer > EPS) continue;
      van.timer = 0;
      if (van.phase === 'out') {
        const money = van.cargo.mul(st.priceFactor);
        s.money = s.money.add(money);
        s.stats.totalEarned = s.stats.totalEarned.add(money);
        s.stats.vanTrips += 1;
        if (ctx.report) ctx.report.earned = ctx.report.earned.add(money);
        ctx.events?.push({ type: 'sale', van: v, value: money });
        noteSold(s, money, ctx);
        van.cargo = D(0);
        van.phase = 'back';
        van.timer = half;
      } else {
        van.phase = 'dock';
      }
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Golden cocoa bean                                                          */
/* ------------------------------------------------------------------------- */

export function scheduleGolden(s: GameState): void {
  const g = BALANCE.golden;
  s.golden.nextIn = (g.minInterval + nextRandom(s) * (g.maxInterval - g.minInterval)) * R.goldenInterval(s);
}

function goldenAdvance(s: GameState, dt: number, ctx: SimContext): void {
  const g = s.golden;
  if (g.active) {
    g.active.remaining -= dt;
    if (g.active.remaining <= 0) {
      g.active = null;
      scheduleGolden(s);
      ctx.events?.push({ type: 'goldenExpire' });
    }
    return;
  }
  g.nextIn -= dt;
  if (g.nextIn <= 0) {
    g.active = { remaining: BALANCE.golden.lifetime, seed: Math.floor(nextRandom(s) * 1e9) };
    ctx.events?.push({ type: 'goldenSpawn' });
  }
}
