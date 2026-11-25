import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import { BALANCE } from '../config/balance';
import { formatMoney } from '../core/format';
import { ratio } from '../core/num';
import type { GameStore } from '../game/GameStore';
import { quoteUpgrade } from '../sim/actions';
import { analyzeFlow, floorStats, floorUnlockCost, liftStats, logisticsMilestoneFactors, managerOf, shipStats } from '../sim/formulas';
import type { StationId } from '../sim/types';
import { tex } from './assets';
import { Sprite } from 'pixi.js';
import { FloatingTexts, Particles } from './fx';
import { computeLayout, L, type WorldLayout } from './layout';
import { P } from './palette';
import { Landscape, Sky } from './scenery';
import { Snowfall, WinterDecor } from './winterDecor';
import { visibleDecor } from '../sim/winter';
import { ConstructionView, FloorView, GroundView, LiftView, RoofView, Van, vanSlotX, type Fx } from './views';

export interface WorldUi {
  openStation: (id: StationId) => void;
  openManagers: (id: StationId) => void;
  openUnlock: (floor: number) => void;
  feedback: (kind: 'tap' | 'skill' | 'fail' | 'sale' | 'batch') => void;
  moneyAnchor: () => { x: number; y: number } | null;
  moneyBump: () => void;
  insets: () => { top: number; bottom: number };
}

class GoldenBean extends Container {
  private shine: Sprite;
  private beanS: Sprite;
  t = 0;
  constructor(onTap: () => void) {
    super();
    this.shine = new Sprite(tex('effekte/goldglanz'));
    this.shine.anchor.set(0.5);
    this.shine.scale.set(96 / this.shine.texture.width);
    this.shine.blendMode = 'add';
    this.beanS = new Sprite(tex('produkte/goldene_kakaobohne'));
    this.beanS.anchor.set(0.5);
    this.beanS.scale.set(50 / this.beanS.texture.height);
    this.addChild(this.shine, this.beanS);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-46, -46, 92, 92);
    this.on('pointertap', onTap);
    this.visible = false;
  }
  update(dt: number) {
    this.t += dt;
    const k = 0.5 + Math.sin(this.t * 6) * 0.5;
    this.shine.rotation = this.t * 0.8;
    this.shine.alpha = 0.55 + k * 0.45;
    this.shine.scale.set((88 + k * 14) / this.shine.texture.width);
    this.beanS.rotation = 0.35 + Math.sin(this.t * 3) * 0.2;
  }
}

/**
 * The animated game world. Reads the simulation state every frame and turns
 * it into visuals; all economic decisions stay in the simulation.
 */
export class World {
  app = new Application();
  private store!: GameStore;
  private ui!: WorldUi;
  private sky = new Sky();
  private world = new Container();
  private landscape = new Landscape();
  private tower = new Container();
  private roof!: RoofView;
  private construction!: ConstructionView;
  private floors: FloorView[] = [];
  private ground!: GroundView;
  private lift!: LiftView;
  private vans: Van[] = [];
  private vanLayer = new Container();
  private fx!: Particles;
  private floaters = new FloatingTexts();
  private screenFx!: Particles;
  private screenFloaters = new FloatingTexts();
  private ripples = new Graphics();
  private rippleList: { x: number; y: number; t: number }[] = [];
  private golden!: GoldenBean;
  private layout: WorldLayout = computeLayout(1, BALANCE.floors.length);
  private scale = 1;
  private towerX = 0;
  private scrollY = 0;
  private vel = 0;
  private pointer: { id: number; startY: number; lastY: number; lastT: number; moved: boolean } | null = null;
  private dragging = false;
  private hudTimer = 0;
  private flowCache = { bottleneck: 'production' as string };
  private lastLiftPos = 0;
  private destroyed = false;
  private initialScrollDone = false;
  private decor = new WinterDecor();
  private snow = new Snowfall();
  private decorKey = '';

  async init(host: HTMLElement, store: GameStore, ui: WorldUi) {
    this.store = store;
    this.ui = ui;
    await this.app.init({
      resizeTo: host,
      antialias: true,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2.5),
      powerPreference: 'high-performance',
    });
    if (this.destroyed) return;
    host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';

    this.fx = new Particles(this.app.renderer);
    this.screenFx = new Particles(this.app.renderer);
    this.screenFx.max = 120;

    const fx: Fx = {
      puff: (x, y, scale) => this.fx.puff(this.towerX + x, y, scale),
      burst: (key, x, y, size) => this.fx.burst(key, this.towerX + x, y, size),
      sparks: (x, y, n) => this.fx.spawn('spark', this.towerX + x, y, n, { up: 90 }),
      dust: (x, y) => this.fx.spawn('dust', this.towerX + x, y, 3, { up: 40, spread: 1.4 }),
    };

    this.roof = new RoofView(fx);
    this.construction = new ConstructionView(() => {
      if (!this.dragging && this.construction.floor >= 0) this.ui.openUnlock(this.construction.floor);
    });
    this.ground = new GroundView({
      tapShip: (x, y) => this.tapStation('ship', x, y),
      tapLift: (x, y) => this.tapStation('lift', x, y),
      openShip: () => !this.dragging && this.ui.openStation('ship'),
      openLift: () => !this.dragging && this.ui.openStation('lift'),
      slotShip: () => this.slotTap('ship'),
      slotLift: () => this.slotTap('lift'),
    });
    this.lift = new LiftView((x, y) => this.tapStation('lift', x, y));
    for (let i = 0; i < BALANCE.floors.length; i++) {
      const id = `f${i}` as StationId;
      const fv = new FloorView(
        i,
        {
          tap: (x, y) => this.tapStation(id, x, y),
          openStation: () => !this.dragging && this.ui.openStation(id),
          slotTap: () => this.slotTap(id),
        },
        fx,
      );
      fv.floatText = (x, y, t) => this.floaters.spawn(this.towerX + x, y, t, P.ivory, 13);
      this.floors.push(fv);
    }

    this.tower.addChild(this.roof, this.construction, ...this.floors, this.ground, this.lift, this.decor);
    this.world.addChild(this.landscape.back, this.tower, this.landscape.front, this.vanLayer, this.fx, this.floaters, this.ripples);
    this.golden = new GoldenBean(() => this.catchGolden());
    this.app.stage.addChild(this.sky, this.world, this.snow, this.screenFx, this.screenFloaters, this.golden);

    // input: scrolling is handled on the DOM canvas so the Pixi stage stays
    // passive (an interactive stage would make every graphic hit-testable).
    const cv = this.app.canvas;
    cv.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    cv.addEventListener('wheel', this.onWheel, { passive: false });

    this.app.renderer.on('resize', () => this.relayout(true));
    this.relayout(true);
    this.app.ticker.add((t) => this.tick(t.deltaMS / 1000));
  }

  destroy() {
    this.destroyed = true;
    try {
      this.app.canvas?.removeEventListener('wheel', this.onWheel);
      this.app.canvas?.removeEventListener('pointerdown', this.onDown);
      window.removeEventListener('pointermove', this.onMove);
      window.removeEventListener('pointerup', this.onUp);
      window.removeEventListener('pointercancel', this.onUp);
      this.app.destroy(true, { children: true });
    } catch {
      /* not initialised yet */
    }
  }

  pause(p: boolean) {
    if (!this.app.ticker) return;
    if (p) this.app.ticker.stop();
    else this.app.ticker.start();
  }

  /* ---------------- layout & scroll ---------------- */

  private viewH() {
    return this.app.screen.height;
  }

  private bounds() {
    const ins = this.ui.insets();
    const content = this.layout.total * this.scale;
    const min = -ins.top - 14; // keep the roof lettering clear of the flow chips
    const max = content - this.viewH() + ins.bottom - 4;
    if (max < min) {
      const mid = (min + max) / 2;
      return { min: mid, max: mid };
    }
    return { min, max };
  }

  relayout(keepBottom: boolean) {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const before = this.bounds();
    const fromBottom = before.max - this.scrollY;
    this.scale = Math.max(0.72, Math.min(1.55, w / L.designW, h / 640));
    // Desktop: the HUD column sits on the left, so centre the tower in the remaining space.
    const leftInset = w >= 900 ? 470 : 0;
    this.towerX = leftInset / this.scale + ((w - leftInset) / this.scale - L.towerW) / 2 + 6;
    this.world.scale.set(this.scale);
    this.sky.resize(w, h);
    this.snow.resize(w, h);

    const s = this.store.state;
    const unlocked = s.floors.filter((f) => f.unlocked).length;
    this.layout = computeLayout(unlocked, BALANCE.floors.length);
    const lay = this.layout;
    this.tower.x = this.towerX;
    this.roof.y = lay.construction ? lay.constructionY - L.roofH : lay.floorY(unlocked - 1) - L.roofH;
    this.construction.visible = lay.construction;
    this.construction.y = lay.constructionY;
    for (let i = 0; i < this.floors.length; i++) {
      const fv = this.floors[i];
      fv.visible = i < unlocked;
      if (fv.visible) fv.y = lay.floorY(i);
      fv.x = 0;
    }
    this.ground.y = lay.groundY;
    const top = this.roof.y + L.roofH - 14;
    this.lift.layout(top, lay.groundY + L.groundH);
    this.landscape.layout(lay.groundY);
    this.landscape.back.x = this.towerX;
    this.landscape.front.x = this.towerX;

    this.applyDecor(true);

    const b = this.bounds();
    if (!this.initialScrollDone) {
      this.scrollY = b.max;
      this.initialScrollDone = true;
    } else if (keepBottom) this.scrollY = b.max - fromBottom;
    this.scrollY = Math.max(b.min - 40, Math.min(b.max + 40, this.scrollY));
  }

  /** Winter decoration from the Advent calendar (December, setting on). */
  private applyDecor(force: boolean) {
    const set = visibleDecor(this.store.state, this.store.advent);
    const key = [...set].sort().join(',');
    if (!force && key === this.decorKey) return;
    this.decorKey = key;
    this.decor.apply(set, this.layout, this.roof.y);
    this.roof.setSnow(set.has('schneedach'));
    this.ground.setGarland(set.has('girlande'));
    this.snow.visible = set.has('schneefall');
    this.sky.setWinter(set.has('schneefall'));
  }

  /** Smoothly bring a station into view. */
  focus(id: StationId) {
    let y: number;
    if (id === 'lift' || id === 'ship') y = this.layout.groundY + L.groundH / 2;
    else y = this.layout.floorY(Number(id.slice(1))) + L.floorH / 2;
    const target = y * this.scale - this.viewH() / 2;
    const b = this.bounds();
    this.scrollTarget = Math.max(b.min, Math.min(b.max, target));
  }
  private scrollTarget: number | null = null;

  private onDown = (e: PointerEvent) => {
    if (this.pointer) return;
    this.pointer = { id: e.pointerId, startY: e.clientY, lastY: e.clientY, lastT: performance.now(), moved: false };
    this.dragging = false;
    this.vel = 0;
    this.scrollTarget = null;
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointer;
    if (!p || e.pointerId !== p.id) return;
    const y = e.clientY;
    const dy = y - p.lastY;
    const now = performance.now();
    const dt = Math.max(1, now - p.lastT) / 1000;
    if (!p.moved && Math.abs(y - p.startY) > 9) {
      p.moved = true;
      this.dragging = true;
    }
    if (p.moved) {
      const b = this.bounds();
      const out = this.scrollY < b.min || this.scrollY > b.max;
      this.scrollY -= out ? dy * 0.4 : dy;
      this.vel = this.vel * 0.6 + (-dy / dt) * 0.4;
    }
    p.lastY = y;
    p.lastT = now;
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pointer || e.pointerId !== this.pointer.id) return;
    if (performance.now() - this.pointer.lastT > 80) this.vel = 0;
    this.pointer = null;
    // Pixi delivers the tap after this DOM event; keep the drag flag one tick longer.
    setTimeout(() => (this.dragging = false), 30);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.scrollTarget = null;
    this.scrollY += e.deltaY * (e.deltaMode === 1 ? 30 : 1);
    const b = this.bounds();
    this.scrollY = Math.max(b.min, Math.min(b.max, this.scrollY));
    this.vel = 0;
  };

  private updateScroll(dt: number) {
    const b = this.bounds();
    if (this.scrollTarget !== null) {
      this.scrollY += (this.scrollTarget - this.scrollY) * Math.min(1, dt * 8);
      if (Math.abs(this.scrollTarget - this.scrollY) < 0.5) this.scrollTarget = null;
    } else if (!this.pointer) {
      this.scrollY += this.vel * dt;
      this.vel *= Math.exp(-3.2 * dt);
      if (Math.abs(this.vel) < 5) this.vel = 0;
      if (this.scrollY < b.min) {
        this.scrollY += (b.min - this.scrollY) * Math.min(1, dt * 12);
        this.vel *= 0.5;
      } else if (this.scrollY > b.max) {
        this.scrollY += (b.max - this.scrollY) * Math.min(1, dt * 12);
        this.vel *= 0.5;
      }
    }
    this.world.y = -this.scrollY;
  }

  /** World (tower-relative) → screen coordinates. */
  private toScreen(x: number, y: number) {
    return { x: (this.towerX + x) * this.scale, y: y * this.scale - this.scrollY };
  }

  /** Screen positions of interactive elements (used by automated browser tests). */
  debugPositions(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    this.floors.forEach((fv, i) => {
      if (!fv.visible) return;
      out[`f${i}`] = this.toScreen(150, fv.y + 90);
      out[`f${i}badge`] = this.toScreen(fv.badge.x + 33, fv.y + fv.badge.y + 19);
      out[`f${i}slot`] = this.toScreen(fv.slot.x, fv.y + fv.slot.y);
    });
    out.lift = this.toScreen(L.shaftX + L.shaftW / 2, this.lift.car.y - 30);
    out.ship = this.toScreen(150, this.ground.y + 120);
    out.liftbadge = this.toScreen(this.ground.liftBadge.x + 33, this.ground.y + this.ground.liftBadge.y + 19);
    out.shipbadge = this.toScreen(this.ground.shipBadge.x + 33, this.ground.y + this.ground.shipBadge.y + 19);
    if (this.construction.visible) out.construction = this.toScreen(161, this.construction.y + 106);
    if (this.golden.visible) out.golden = { x: this.golden.x, y: this.golden.y };
    return out;
  }

  /* ---------------- interactions ---------------- */

  private tapStation(id: StationId, x: number, y: number) {
    if (this.dragging) return;
    const r = this.store.tap(id);
    this.rippleList.push({ x: this.towerX + x, y, t: 0 });
    if (this.rippleList.length > 6) this.rippleList.shift();
    if (r === 'started' || r === 'boosted') {
      this.fx.spawn('spark', this.towerX + x, y, r === 'started' ? 5 : 2, { up: 110 });
      this.ui.feedback('tap');
    } else if (r === 'limited') this.ui.feedback('tap');
    else this.ui.feedback('fail');
  }

  private slotTap(id: StationId) {
    if (this.dragging) return;
    const m = managerOf(this.store.state, id);
    if (m && m.skillCooldown <= 0 && m.skillActive <= 0) {
      if (this.store.skill(m.id)) {
        const p = this.slotWorldPos(id);
        this.fx.spawn('spark', p.x, p.y, 16, { up: 160, spread: 6.3 });
        this.fx.spawn('confetti', p.x, p.y, 10, { up: 150, spread: 3, tint: [P.brassLight, P.burgundyLight, P.ivory] });
        this.ui.feedback('skill');
        return;
      }
    }
    this.ui.openManagers(id);
  }

  private slotWorldPos(id: StationId) {
    if (id === 'ship') return { x: this.towerX + this.ground.shipSlot.x, y: this.ground.y + this.ground.shipSlot.y };
    if (id === 'lift') return { x: this.towerX + this.ground.liftSlot.x, y: this.ground.y + this.ground.liftSlot.y };
    const fv = this.floors[Number(id.slice(1))];
    return { x: this.towerX + fv.slot.x, y: fv.y + fv.slot.y };
  }

  private catchGolden() {
    const g = this.golden;
    const x = g.x;
    const y = g.y;
    const r = this.store.golden();
    if (!r) return;
    this.screenFx.spawn('spark', x, y, 24, { up: 260, spread: 6.3 });
    this.screenFx.spawn('confetti', x, y, 18, { up: 220, spread: 6.3, tint: [P.brassLight, P.brass, P.ivory] });
    if (r.kind === 'cash') {
      const a = this.ui.moneyAnchor();
      if (a) for (let i = 0; i < 10; i++) this.screenFx.flyTo(x, y, a.x, a.y, i * 0.04, i === 9 ? () => this.ui.moneyBump() : undefined);
      this.screenFloaters.spawn(x, y - 30, `+${formatMoney(r.amount, this.store.state.settings.notation)}`, P.brassLight, 22, 1.6);
    } else {
      this.screenFloaters.spawn(x, y - 30, r.kind === 'rush' ? 'Goldrausch!' : 'Express!', P.brassLight, 22, 1.6);
    }
    g.visible = false;
  }

  /* ---------------- frame ---------------- */

  private tick(dt: number) {
    dt = Math.min(dt, 0.1);
    const store = this.store;
    store.frame();
    const s = store.state;
    const unlocked = s.floors.filter((f) => f.unlocked).length;
    if (unlocked !== this.layout.floors) {
      const grew = unlocked > this.layout.floors;
      this.relayout(true);
      const fv = this.floors[unlocked - 1];
      if (grew) this.fx.spawn('confetti', this.towerX + 160, fv.y + 60, 40, { up: 260, spread: 3.2, tint: [P.brassLight, P.burgundyLight, P.ivory, P.brass] });
    }

    this.consumeEvents();
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.syncHud();
      this.applyDecor(false);
    }
    this.animate(dt);
    this.updateScroll(dt);
  }

  private consumeEvents() {
    const s = this.store.state;
    const notation = s.settings.notation;
    let sales = 0;
    for (const e of this.store.drainSimEvents()) {
      switch (e.type) {
        case 'batch': {
          const fv = this.floors[e.floor];
          if (fv?.visible) fv.onBatch(`+${formatMoney(e.value, notation)}`);
          this.ui.feedback('batch');
          break;
        }
        case 'liftUnload':
          this.ground.conveyor();
          break;
        case 'sale': {
          if (sales++ > 2) break;
          const y = this.layout.groundY + L.groundH + 40;
          const p = this.toScreen(0, y);
          // vans leave the tower to the left: start the money trail at the tower's left edge
          const sx = Math.max(26, p.x - 30);
          const sy = Math.max(60, Math.min(this.viewH() - 60, p.y));
          if (p.y > 0 && p.y < this.viewH()) this.screenFloaters.spawn(sx + 40, sy - 20, `+${formatMoney(e.value, notation)}`, P.brassLight, 17, 1.4);
          const a = this.ui.moneyAnchor();
          if (a) {
            const n = Math.min(6, 2 + Math.floor(Math.log10(Math.max(1, e.value.toNumber())) / 2));
            for (let i = 0; i < n; i++) this.screenFx.flyTo(sx + Math.random() * 20, sy, a.x, a.y, i * 0.06, i === n - 1 ? () => this.ui.moneyBump() : undefined);
          }
          this.ui.feedback('sale');
          break;
        }
        default:
          break;
      }
    }
  }

  private syncHud() {
    const s = this.store.state;
    const flow = analyzeFlow(s);
    this.flowCache.bottleneck = flow.bottleneck;
    const notation = s.settings.notation;
    for (let i = 0; i < this.floors.length; i++) {
      const f = s.floors[i];
      const fv = this.floors[i];
      if (!f.unlocked) continue;
      const st = floorStats(s, i);
      const id = `f${i}` as StationId;
      const m = managerOf(s, id);
      fv.sync({
        level: f.level,
        affordable: quoteUpgrade(s, id, 1).affordable,
        workers: st.workers,
        tier: st.tier,
        progress: f.progress,
        running: f.running,
        stalled: f.stalled,
        bufferFill: ratio(f.buffer, st.bufferCap),
        bufferLabel: formatMoney(f.buffer, notation),
        showHint: !f.managerId && !f.running,
      });
      fv.slot.setManager(m, m ? BALANCE.managers.rarities[m.rarity].duration : 1, BALANCE.managers.skillCooldown);
    }
    const next = s.floors.findIndex((f) => !f.unlocked);
    if (next >= 0) {
      const cost = floorUnlockCost(next);
      this.construction.sync(next, formatMoney(cost, notation), s.money.gte(cost));
    }
    const ls = liftStats(s);
    const lm = managerOf(s, 'lift');
    const sm = managerOf(s, 'ship');
    this.ground.liftBadge.setLevel(s.lift.level);
    this.ground.liftBadge.setAffordable(quoteUpgrade(s, 'lift', 1).affordable);
    this.ground.shipBadge.setLevel(s.ship.level);
    this.ground.shipBadge.setAffordable(quoteUpgrade(s, 'ship', 1).affordable);
    this.ground.liftSlot.setManager(lm, lm ? BALANCE.managers.rarities[lm.rarity].duration : 1, BALANCE.managers.skillCooldown);
    this.ground.shipSlot.setManager(sm, sm ? BALANCE.managers.rarities[sm.rarity].duration : 1, BALANCE.managers.skillCooldown);
    const depotFill = ratio(s.ship.depot, ls.depotCap);
    this.ground.setDepot(depotFill, formatMoney(s.ship.depot, notation), depotFill > 0.97 || s.lift.blocked);
    // vans
    const sh = shipStats(s);
    while (this.vans.length < sh.vans) {
      const v = new Van();
      this.vans.push(v);
      this.vanLayer.addChild(v);
    }
    void logisticsMilestoneFactors;
  }

  private animate(dt: number) {
    const s = this.store.state;
    const alpha = this.store.alpha;
    const ddt = BALANCE.dt * alpha;
    this.sky.update(dt, this.scrollY / Math.max(1, this.layout.total * this.scale));
    // floors
    let anyRunning = false;
    for (let i = 0; i < this.floors.length; i++) {
      const f = s.floors[i];
      if (!f.unlocked) continue;
      const st = floorStats(s, i);
      const fv = this.floors[i];
      if (f.running && !f.stalled) anyRunning = true;
      fv.update(dt, rushFactor(f.rush) / st.cycle);
    }
    // lift: extrapolate position inside the current sim step for smooth motion
    const L0 = s.lift;
    const ls = liftStats(s);
    let pos = L0.pos;
    const lddt = ddt * rushFactor(L0.rush);
    if (L0.phase === 'up') pos = Math.min(Math.floor(L0.pos + 1e-6) + 1, L0.pos + lddt / ls.floorTime);
    else if (L0.phase === 'down') pos = Math.max(0, L0.pos - lddt / ls.floorTime);
    const liftSpeed = (pos - this.lastLiftPos) / Math.max(dt, 1e-3);
    this.lastLiftPos = pos;
    this.lift.sync(this.layout.liftY(pos), ratio(L0.cargo, ls.capacity), this.flowCache.bottleneck === 'lift' && this.layout.floors > 0 && !!s.lift.managerId);
    this.lift.update(dt);
    this.decor.update(dt);
    this.snow.update(dt);
    this.roof.update(dt, liftSpeed, anyRunning);
    this.construction.update(dt);
    this.ground.update(dt);
    // vans
    const sh = shipStats(s);
    const groundBase = this.layout.groundY + L.groundH;
    const exitX = -this.towerX - 90;
    const half = sh.roundTrip / 2;
    const vddt = ddt * rushFactor(s.ship.rush);
    for (let k = 0; k < this.vans.length; k++) {
      const v = this.vans[k];
      const vs = s.ship.vans[k];
      if (!vs) {
        v.visible = false;
        continue;
      }
      v.visible = true;
      const slot = vanSlotX(k);
      const parkedY = groundBase + 34;
      const outY = groundBase + 60;
      const inY = groundBase + 84;
      let x = slot;
      let y = parkedY;
      let speed = 0;
      if (vs.phase === 'out') {
        const p = Math.min(1, 1 - Math.max(0, vs.timer - vddt) / half);
        const lane = Math.min(1, p / 0.15);
        y = parkedY + (outY - parkedY) * lane;
        const e = p * p;
        x = slot + (exitX - slot) * e;
        v.facingLeft = true;
        speed = 400 * p;
      } else if (vs.phase === 'back') {
        const p = Math.min(1, 1 - Math.max(0, vs.timer - vddt) / half);
        const lane = Math.max(0, (p - 0.85) / 0.15);
        y = inY + (parkedY - inY) * lane;
        const e = 1 - (1 - p) * (1 - p);
        x = exitX + (slot + 30 - exitX) * e - lane * 30;
        v.facingLeft = lane > 0.6;
        speed = -400 * (1 - p);
      } else v.facingLeft = true;
      v.position.set(this.towerX + x, y);
      v.zIndex = y;
      v.update(dt, speed);
    }
    this.vanLayer.sortableChildren = true;
    // golden bean
    const ga = s.golden.active;
    if (ga) {
      const g = this.golden;
      const w = this.app.screen.width;
      const h = this.app.screen.height;
      const p = 1 - ga.remaining / BALANCE.golden.lifetime;
      const fromLeft = ga.seed % 2 === 0;
      const ins = this.ui.insets();
      const band = Math.max(80, h - ins.top - ins.bottom - 120);
      const baseY = ins.top + 60 + ((ga.seed % 997) / 997) * band;
      g.visible = true;
      g.x = fromLeft ? -50 + (w + 100) * p : w + 50 - (w + 100) * p;
      g.y = baseY + Math.sin(p * Math.PI * 4) * 30;
      g.update(dt);
    } else this.golden.visible = false;
    // ripples
    const r = this.ripples;
    r.clear();
    for (let i = this.rippleList.length - 1; i >= 0; i--) {
      const rp = this.rippleList[i];
      rp.t += dt;
      const k = rp.t / 0.35;
      if (k >= 1) {
        this.rippleList.splice(i, 1);
        continue;
      }
      r.circle(rp.x, rp.y, 8 + k * 26).stroke({ width: 4 * (1 - k), color: P.brassLight, alpha: 0.9 * (1 - k) });
    }
    this.fx.update(dt);
    this.floaters.update(dt);
    this.screenFx.update(dt);
    this.screenFloaters.update(dt);
  }
}

/** Speed factor a station runs at while tap time is being paid out (matches sim.payRush). */
function rushFactor(rush: number): number {
  if (rush <= 0) return 1;
  const extra = Math.min(rush, BALANCE.dt * (BALANCE.tap.maxSpeed - 1));
  return 1 + extra / BALANCE.dt;
}
