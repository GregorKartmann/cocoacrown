import { BALANCE } from '../config/balance';
import { D, Decimal } from '../core/num';
import * as A from '../sim/actions';
import { analyzeFlow } from '../sim/formulas';
import { createGame, defaultSettings } from '../sim/init';
import { catchUp, type OfflineReport } from '../sim/offline';
import { step } from '../sim/sim';
import type { BuyMode, GameState, ManagerCategory, Settings, SimEvent, StationId } from '../sim/types';
import { SaveManager, exportSaveText, importSaveText } from '../save/storage';

export type UiEvent =
  | { type: 'toast'; text: string; tone?: 'info' | 'good' | 'warn' | 'gold' }
  | { type: 'unlock'; floor: number }
  | { type: 'upgrade'; station: StationId; levels: number; milestone: boolean }
  | { type: 'golden'; reward: A.GoldenReward }
  | { type: 'quest'; reward: number }
  | { type: 'hire'; managerId: string }
  | { type: 'skill'; managerId: string; station: StationId }
  | { type: 'tap'; station: StationId; result: A.TapResult }
  | { type: 'brandSold'; crowns: number }
  | { type: 'fail'; station?: StationId };

/** Rolling window of real sales for the "€/s" display. */
class IncomeTracker {
  private buckets: Decimal[] = Array.from({ length: 20 }, () => D(0));
  private head = 0;
  private bucketTime = 0;
  private filled = 1;
  add(v: Decimal) {
    this.buckets[this.head] = this.buckets[this.head].add(v);
  }
  tick(dt: number) {
    this.bucketTime += dt;
    while (this.bucketTime >= 1) {
      this.bucketTime -= 1;
      this.head = (this.head + 1) % this.buckets.length;
      this.buckets[this.head] = D(0);
      this.filled = Math.min(this.buckets.length, this.filled + 1);
    }
  }
  rate(): Decimal {
    let sum = D(0);
    for (const b of this.buckets) sum = sum.add(b);
    const span = Math.max(1, this.filled - 1 + this.bucketTime);
    return sum.div(span);
  }
  reset() {
    this.buckets = this.buckets.map(() => D(0));
    this.filled = 1;
    this.bucketTime = 0;
  }
}

const AUTOSAVE_MS = 15000;
/** Larger gaps are treated as an absence (catch-up path). */
const MAX_FRAME_GAP_MS = 3000;

/**
 * Owns the game state and the fixed-step loop. Rendering and React only read
 * from here and call the action methods; nothing outside mutates the state.
 */
export class GameStore {
  state: GameState;
  /** Sim events since the renderer last drained them. */
  simEvents: SimEvent[] = [];
  uiEvents: UiEvent[] = [];
  offlineReport: OfflineReport | null = null;
  /** Fraction of a sim step not yet simulated (for visual extrapolation). */
  alpha = 0;
  income = new IncomeTracker();
  saveError: string | null = null;
  blockedByOtherTab = false;

  private acc = 0;
  private lastPerf = 0;
  private listeners = new Set<() => void>();
  private uiListeners = new Set<(e: UiEvent) => void>();
  private version = 0;
  private lastNotify = 0;
  private lastSave = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    state: GameState,
    private saves: SaveManager | null,
  ) {
    this.state = state;
  }

  /* ---------------- lifecycle ---------------- */

  /** Called once after loading: credit the time since the last save. */
  resume(now = Date.now()): void {
    const report = catchUp(this.state, now);
    if (report && report.awaySeconds >= BALANCE.offline.reportThresholdSeconds && report.earned.gt(0)) this.offlineReport = report;
    this.lastPerf = performance.now();
    this.acc = 0;
    this.persist(true);
  }

  start(): void {
    this.running = true;
    this.lastPerf = performance.now();
  }

  stop(): void {
    this.running = false;
  }

  /** Advance by real time. Called from the render ticker every frame. */
  frame(nowPerf = performance.now()): void {
    if (!this.running || this.blockedByOtherTab) return;
    const gap = nowPerf - this.lastPerf;
    this.lastPerf = nowPerf;
    if (gap > MAX_FRAME_GAP_MS || gap < 0) {
      // Device slept or tab was frozen without a visibility event.
      this.handleAbsence();
      return;
    }
    this.acc += gap / 1000;
    const dt = BALANCE.dt;
    const ctx = { events: this.simEvents, offline: false };
    let n = 0;
    while (this.acc >= dt && n < 20) {
      step(this.state, dt, ctx);
      this.income.tick(dt);
      this.acc -= dt;
      n++;
    }
    if (n === 20) this.acc = 0;
    this.alpha = this.acc / dt;
    // Wall clock of the simulated present (used for offline credit).
    this.state.lastWallTime = Date.now() - this.acc * 1000;
    if (nowPerf - this.lastSave > AUTOSAVE_MS) this.persist(false);
    if (nowPerf - this.lastNotify > 100) this.notify();
  }

  /** Visibility returned or long freeze: credit the elapsed time like offline time. */
  handleAbsence(): void {
    const report = catchUp(this.state, Date.now());
    this.acc = 0;
    this.lastPerf = performance.now();
    this.income.reset();
    if (report && report.awaySeconds >= BALANCE.offline.reportThresholdSeconds && report.earned.gt(0)) {
      this.offlineReport = report;
    }
    this.persist(true);
    this.notify(true);
  }

  onHidden(): void {
    // Simulate up to now so the save carries the exact wall time, then save
    // both asynchronously (IndexedDB) and synchronously (emergency copy).
    this.frame(performance.now());
    if (this.saves && !this.blockedByOtherTab) this.saves.saveSync(this.state);
    this.persist(true);
  }

  /* ---------------- persistence ---------------- */

  persist(immediate: boolean): void {
    if (!this.saves || this.blockedByOtherTab) return;
    const doSave = () => {
      this.saveTimer = null;
      this.lastSave = performance.now();
      // Keep the synchronous copy in step with every save so it can never be
      // an older state that would credit offline time a second time.
      this.saves!.saveSync(this.state);
      this.saves!
        .save(this.state)
        .then(() => (this.saveError = null))
        .catch((e) => {
          this.saveError = e instanceof Error ? e.message : String(e);
        });
    };
    if (immediate) {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      doSave();
    } else if (!this.saveTimer) {
      this.saveTimer = setTimeout(doSave, 800);
    }
  }

  exportSave(): string {
    this.state.lastWallTime = Date.now();
    return exportSaveText(this.state);
  }

  importSave(text: string): void {
    const s = importSaveText(text);
    // Never credit offline time for the imported file's age twice: start now.
    s.lastWallTime = Date.now();
    s.settings = { ...this.state.settings };
    this.state = s;
    this.saves?.saveSync(this.state);
    this.simEvents = [];
    this.income.reset();
    this.persist(true);
    this.emit({ type: 'toast', text: 'Spielstand importiert.', tone: 'good' });
    this.notify(true);
  }

  resetGame(): void {
    const settings = this.state.settings;
    this.state = createGame(Date.now(), undefined, settings);
    this.saves?.saveSync(this.state);
    this.simEvents = [];
    this.income.reset();
    this.offlineReport = null;
    this.persist(true);
    this.notify(true);
  }

  /* ---------------- subscriptions ---------------- */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  notify(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastNotify < 100) return;
    this.lastNotify = now;
    this.version++;
    for (const l of this.listeners) l();
  }

  onUiEvent(fn: (e: UiEvent) => void): () => void {
    this.uiListeners.add(fn);
    return () => this.uiListeners.delete(fn);
  }

  emit(e: UiEvent): void {
    this.uiEvents.push(e);
    for (const l of this.uiListeners) l(e);
  }

  drainSimEvents(): SimEvent[] {
    const ev = this.simEvents;
    this.simEvents = [];
    for (const e of ev) if (e.type === 'sale') this.income.add(e.value);
    return ev;
  }

  /* ---------------- actions ---------------- */

  tap(station: StationId): A.TapResult {
    const r = A.tapStation(this.state, station, { events: this.simEvents, offline: false });
    this.emit({ type: 'tap', station, result: r });
    if (r === 'nothing' && station === 'lift') this.emit({ type: 'toast', text: 'Keine Ware zum Abholen.', tone: 'info' });
    if (r === 'nothing' && station === 'ship') this.emit({ type: 'toast', text: 'Das Versandlager ist leer.', tone: 'info' });
    this.notify(true);
    return r;
  }

  buy(station: StationId, mode: BuyMode): number {
    const before = levelOf(this.state, station);
    const n = A.buyUpgrade(this.state, station, mode);
    if (n > 0) {
      const after = levelOf(this.state, station);
      this.emit({ type: 'upgrade', station, levels: n, milestone: crossedMilestone(station, before, after) });
      this.persist(false);
    } else this.emit({ type: 'fail', station });
    this.notify(true);
    return n;
  }

  unlock(floor: number): boolean {
    const ok = A.unlockFloor(this.state, floor);
    if (ok) {
      this.emit({ type: 'unlock', floor });
      this.persist(true);
    } else this.emit({ type: 'fail' });
    this.notify(true);
    return ok;
  }

  hire(category: ManagerCategory, assignTo?: StationId): string | null {
    const m = A.hireManager(this.state, category);
    if (!m) {
      this.emit({ type: 'fail' });
      this.notify(true);
      return null;
    }
    if (assignTo) A.assignManager(this.state, m.id, assignTo);
    this.emit({ type: 'hire', managerId: m.id });
    this.persist(true);
    this.notify(true);
    return m.id;
  }

  assign(managerId: string, station: StationId | null): void {
    A.assignManager(this.state, managerId, station);
    this.persist(false);
    this.notify(true);
  }

  skill(managerId: string): boolean {
    const ok = A.activateSkill(this.state, managerId);
    const m = this.state.managers.find((x) => x.id === managerId);
    if (ok && m?.assignedTo) this.emit({ type: 'skill', managerId, station: m.assignedTo });
    this.notify(true);
    return ok;
  }

  golden(): A.GoldenReward | null {
    const r = A.catchGolden(this.state);
    if (r) {
      this.emit({ type: 'golden', reward: r });
      this.persist(false);
    }
    this.notify(true);
    return r;
  }

  /** "Marke verkaufen": crowns for a fresh start (see actions.sellBrand). */
  sellBrand(): number {
    const crowns = A.sellBrand(this.state);
    if (crowns > 0) {
      this.income.reset();
      this.emit({ type: 'brandSold', crowns });
      this.persist(true);
    } else this.emit({ type: 'fail' });
    this.notify(true);
    return crowns;
  }

  claimQuest(): number {
    const r = A.claimQuest(this.state);
    if (r > 0) {
      this.emit({ type: 'quest', reward: r });
      this.persist(false);
    }
    this.notify(true);
    return r;
  }

  setSettings(patch: Partial<Settings>): void {
    this.state.settings = { ...this.state.settings, ...patch };
    this.persist(false);
    this.notify(true);
  }

  dismissOffline(): void {
    this.offlineReport = null;
    this.notify(true);
  }

  flow() {
    return analyzeFlow(this.state);
  }
}

export function levelOf(s: GameState, station: StationId): number {
  if (station === 'lift') return s.lift.level;
  if (station === 'ship') return s.ship.level;
  return s.floors[Number(station.slice(1))].level;
}

function crossedMilestone(station: StationId, before: number, after: number): boolean {
  const list: readonly { level: number }[] =
    station === 'lift' ? BALANCE.lift.milestones : station === 'ship' ? BALANCE.shipping.milestones : BALANCE.floorMilestones;
  return list.some((m) => m.level > before && m.level <= after);
}

export function newStateWithDefaults(): GameState {
  return createGame(Date.now(), undefined, defaultSettings());
}
