import { Container, Graphics, Rectangle, Sprite, type Text, type Texture } from 'pixi.js';
import { FLOOR_ART } from '../config/content';
import { tex, subTex } from './assets';
import { P } from './palette';
import { Bar, DISPLAY, LevelBadge, LiveText, ManagerSlot, Tag, label, liveLabel, plate } from './hud';
import { L } from './layout';

export const FLOOR_SHORT = ['Röstnibs', 'Trinkkakao', 'Tafeln', 'Pralinen', 'Trüffel'];

export interface StationHandlers {
  tap: (x: number, y: number) => void;
  openStation: () => void;
  slotTap: () => void;
}

/** Effects the views can trigger in world space (tower coordinates). */
export interface Fx {
  puff: (x: number, y: number, scale?: number) => void;
  burst: (key: string, x: number, y: number, size: number) => void;
  sparks: (x: number, y: number, n: number) => void;
  dust: (x: number, y: number) => void;
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

export function sprite(key: string, ax = 0.5, ay = 1): Sprite {
  const s = new Sprite(tex(key));
  s.anchor.set(ax, ay);
  return s;
}

/** Scales a sprite to fit a box, returns the scale. */
export function fit(s: Sprite, maxW: number, maxH: number): number {
  const k = Math.min(maxW / s.texture.width, maxH / s.texture.height);
  s.scale.set(k);
  return k;
}

function shadow(width: number, alpha = 0.55): Sprite {
  const s = sprite('effekte/kontaktschatten', 0.5, 0.5);
  s.width = width;
  s.height = width * 0.22;
  s.alpha = alpha;
  return s;
}

/**
 * Painted room background, scaled to the interior width, cropped at the top
 * so its floor sits at `standY`, and never drawn below `height`.
 */
function roomBackground(key: string, floorLine: number, standY: number, height: number): Container {
  const c = new Container();
  const base = new Graphics();
  base.rect(0, 0, L.interiorW, height).fill(P.espressoLight);
  c.addChild(base);
  const t = tex(key);
  const k = L.interiorW / t.width;
  const top = standY - (floorLine + 14) * k;
  const s0 = Math.max(0, -top / k);
  const visible = Math.min(t.height - s0, (height - Math.max(0, top)) / k);
  const s = new Sprite(subTex(key, 0, s0, t.width, visible));
  s.scale.set(k);
  s.y = Math.max(0, top);
  c.addChild(s);
  return c;
}

/** Burgundy steel column with brass rivets framing the tower. */
function pillar(height: number): Graphics {
  const g = new Graphics();
  g.rect(-12, 0, 12, height).fill(P.burgundyDark);
  g.rect(-10, 0, 3, height).fill({ color: 0xffffff, alpha: 0.1 });
  for (let y = 8; y < height; y += 22) g.circle(-6, y, 1.6).fill(P.brass);
  g.rect(-1.5, 0, 1.5, height).fill(P.brassDark);
  return g;
}

/** Hanging enamel name plate (two short chains). */
function hangingPlate(text: string, small = false): Container {
  const c = new Container();
  const t = label(text, { fontFamily: DISPLAY, fontSize: small ? 11 : 12, fontWeight: '700', fill: P.ivory });
  const w = Math.max(80, t.width + 24);
  const g = new Graphics();
  g.moveTo(w * 0.22, -10).lineTo(w * 0.22, 2).stroke({ width: 1.6, color: P.brassDark });
  g.moveTo(w * 0.78, -10).lineTo(w * 0.78, 2).stroke({ width: 1.6, color: P.brassDark });
  plate(g, 0, 0, w, 22, P.burgundy, 7);
  t.anchor.set(0.5);
  t.position.set(w / 2, 11);
  c.addChild(g, t);
  (c as Container & { w: number }).w = w;
  return c;
}

/** Ivory speech bubble ("Tippen!"). */
function bubble(text: string): Container {
  const c = new Container();
  const t = label(text, { fontSize: 12.5, fill: P.burgundy, fontWeight: '700' });
  const w = t.width + 24;
  const g = new Graphics();
  g.roundRect(-w / 2 + 1, -13 + 3, w, 26, 13).fill({ color: 0x000000, alpha: 0.25 });
  g.roundRect(-w / 2, -13, w, 26, 13).fill(P.ivory).stroke({ width: 2, color: P.brass });
  g.poly([-6, 12, 6, 12, 0, 20]).fill(P.ivory);
  t.anchor.set(0.5);
  t.y = -0.5;
  c.addChild(g, t);
  c.eventMode = 'none';
  return c;
}

/* ------------------------------------------------------------------------- */
/* Animated figures                                                           */
/* ------------------------------------------------------------------------- */

const WALK_SEQ = [0, 1, 2, 1];

/** Carrier with a painted walk cycle (frames from the pack). */
export class Walker extends Container {
  private frames: Texture[];
  private body: Sprite;
  private t = Math.random();
  walking = false;
  carrying = false;
  targetX = 0;
  speed = 55;
  onArrive: (() => void) | null = null;

  constructor(kind: 'arbeiter' | 'arbeiterin', height = 44) {
    super();
    this.frames = [1, 2, 3].map((i) => tex(`figuren/laufposen/${kind}_0${i}`));
    this.body = new Sprite(this.frames[1]);
    this.body.anchor.set(0.5, 1);
    this.body.scale.set(height / this.frames[1].height);
    this.addChild(shadow(26, 0.45), this.body);
  }

  walkTo(x: number, onArrive: (() => void) | null = null) {
    this.targetX = x;
    this.walking = true;
    this.onArrive = onArrive;
  }

  update(dt: number) {
    if (this.walking) {
      const dx = this.targetX - this.x;
      const step = this.speed * dt;
      if (Math.abs(dx) <= step) {
        this.x = this.targetX;
        this.walking = false;
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        this.x += Math.sign(dx) * step;
        this.body.scale.x = Math.abs(this.body.scale.x) * (dx < 0 ? -1 : 1);
      }
    }
    this.t += dt * (this.speed / 55);
    const f = this.walking ? WALK_SEQ[Math.floor(this.t / 0.115) % 4] : 1;
    this.body.texture = this.frames[f];
    this.body.y = this.walking ? -Math.abs(Math.sin(this.t * 13.6)) * 1.2 : 0;
  }
}

/** Standing figure with a gentle idle motion. */
export class Figure extends Container {
  private body: Sprite;
  private t = Math.random() * 5;
  private base: number;
  constructor(key: string, height = 46, flip = false) {
    super();
    this.body = sprite(key);
    this.base = height / this.body.texture.height;
    this.body.scale.set(this.base * (flip ? -1 : 1), this.base);
    this.addChild(shadow(30, 0.45), this.body);
  }
  update(dt: number, busy: boolean) {
    this.t += dt * (busy ? 2.2 : 1);
    this.body.scale.y = this.base * (1 + Math.sin(this.t * 2) * 0.012);
    this.body.rotation = busy ? Math.sin(this.t * 3) * 0.025 : 0;
  }
}

/* ------------------------------------------------------------------------- */
/* Machines                                                                   */
/* ------------------------------------------------------------------------- */

type V2 = [number, number];
interface MachineFx {
  steam: V2;
  lamp: V2;
  batch: string;
  batchAt: V2;
  drips?: V2[];
  dust?: V2[];
  swirl?: V2;
  glow?: V2;
}

const MACHINE_FX: MachineFx[] = [
  { steam: [0.78, 0.05], lamp: [0.73, 0.66], batch: 'effekte/bohnenwurf', batchAt: [0.4, 0.7], glow: [0.4, 0.49] },
  { steam: [0.21, 0.04], lamp: [0.67, 0.19], batch: 'effekte/schokospritzer', batchAt: [0.45, 0.36], swirl: [0.45, 0.38] },
  { steam: [0.86, 0.09], lamp: [0.88, 0.58], batch: 'effekte/schokospritzer', batchAt: [0.48, 0.74], drips: [[0.37, 0.56], [0.485, 0.56], [0.6, 0.56]] },
  { steam: [0.5, 0.03], lamp: [0.64, 0.86], batch: 'effekte/schokospritzer', batchAt: [0.5, 0.6] },
  { steam: [0.83, 0.08], lamp: [0.86, 0.53], batch: 'effekte/goldglanz', batchAt: [0.4, 0.58], dust: [[0.27, 0.5], [0.4, 0.5], [0.53, 0.5]] },
];

/**
 * A painted machine sprite brought to life: vibration while running, glowing
 * lamps, steam, chocolate drips and an effect burst for every finished batch.
 * Speed follows the simulated cycle time.
 */
export class MachineView extends Container {
  private body: Sprite;
  private baseScale: number;
  private w: number;
  private h: number;
  private fxCfg: MachineFx;
  private lamp = new Graphics();
  private glow = new Graphics();
  private anim = new Graphics();
  private upgrades = new Container();
  private needle: Sprite | null = null;
  private pilot: Sprite | null = null;
  private t = Math.random() * 3;
  private bump = 0;
  private steamTimer = Math.random();
  tier = 1;

  constructor(
    floor: number,
    maxW: number,
    maxH: number,
    private fx: Fx,
    private worldPos: () => { x: number; y: number },
  ) {
    super();
    this.fxCfg = MACHINE_FX[floor];
    this.body = sprite(FLOOR_ART[floor].machine);
    this.baseScale = fit(this.body, maxW, maxH);
    this.w = this.body.width;
    this.h = this.body.height;
    this.lamp.blendMode = 'add';
    this.glow.blendMode = 'add';
    this.addChild(shadow(this.w * 1.05, 0.6), this.body, this.anim, this.glow, this.lamp, this.upgrades);
  }

  /** Local position of a relative point on the sprite (0..1). */
  private at(p: V2): { x: number; y: number } {
    return { x: (p[0] - 0.5) * this.w, y: -this.h + p[1] * this.h };
  }

  setTier(tier: number) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.upgrades.removeChildren();
    this.needle = null;
    this.pilot = null;
    if (tier >= 2) {
      const g = sprite('maschinen/upgrades/druckmesser', 0.5, 0.5);
      g.width = g.height = 19;
      const n = sprite('maschinen/upgrades/zeiger', 0.5, 0.87);
      n.height = 8.5;
      n.scale.x = n.scale.y;
      const p = this.at([0.1, 0.42]);
      g.position.set(p.x, p.y);
      n.position.set(p.x, p.y);
      this.needle = n;
      this.upgrades.addChild(g, n);
    }
    if (tier >= 3) {
      const pl = sprite('maschinen/upgrades/kronenplakette', 0.5, 0.5);
      pl.width = 32;
      pl.scale.y = pl.scale.x;
      const p = this.at([0.5, 0.9]);
      pl.position.set(p.x, p.y);
      const lamp = sprite('maschinen/upgrades/kontrollleuchte', 0.5, 0.5);
      lamp.width = lamp.height = 13;
      const q = this.at([0.9, 0.16]);
      lamp.position.set(q.x, q.y);
      this.pilot = lamp;
      this.upgrades.addChild(pl, lamp);
      const wp = this.worldPos();
      this.fx.burst('effekte/goldglanz', wp.x + p.x, wp.y + p.y, 46);
    }
    const s = this.baseScale * (1 + (tier - 1) * 0.04);
    this.body.scale.set(s);
  }

  pulse() {
    this.bump = 1;
    const p = this.at(this.fxCfg.batchAt);
    const wp = this.worldPos();
    this.fx.burst(this.fxCfg.batch, wp.x + p.x, wp.y + p.y, this.fxCfg.batch.endsWith('goldglanz') ? 30 : 26);
  }

  update(dt: number, speed: number, active: boolean) {
    const rate = active ? Math.min(6, Math.max(0.3, speed)) : 0;
    this.t += dt * (active ? 1 : 0.2);
    if (this.bump > 0) this.bump = Math.max(0, this.bump - dt * 4);
    const squash = Math.sin(this.bump * Math.PI) * 0.05;
    const vib = active ? Math.sin(this.t * (18 + rate * 6)) * 0.35 : 0;
    const base = this.baseScale * (1 + (this.tier - 1) * 0.04);
    this.body.scale.set(base * (1 + squash * 0.5), base * (1 - squash + (active ? Math.sin(this.t * 7) * 0.006 : 0)));
    this.body.x = vib;

    // lamps and glow
    const f = this.fxCfg;
    const lp = this.at(f.lamp);
    this.lamp.clear();
    if (active) {
      const k = 0.55 + Math.sin(this.t * 9) * 0.2 + Math.sin(this.t * 23) * 0.1;
      this.lamp.circle(lp.x, lp.y, 7).fill({ color: P.ember, alpha: 0.35 * k });
      this.lamp.circle(lp.x, lp.y, 3.5).fill({ color: 0xffe2a0, alpha: 0.45 * k });
    }
    this.glow.clear();
    if (f.glow && active) {
      const gp = this.at(f.glow);
      const k = 0.6 + Math.sin(this.t * 6) * 0.25 + this.bump * 0.4;
      this.glow.circle(gp.x, gp.y, 16).fill({ color: P.ember, alpha: 0.22 * k });
      this.glow.circle(gp.x, gp.y, 9).fill({ color: 0xffc070, alpha: 0.2 * k });
    }

    // moving chocolate details drawn on top of the painting
    const a = this.anim;
    a.clear();
    if (active && f.drips) {
      for (let i = 0; i < f.drips.length; i++) {
        const d = this.at(f.drips[i]);
        const ph = (this.t * (1.2 + rate * 0.5) + i * 0.33) % 1;
        const len = 4 + ph * 10;
        a.roundRect(d.x - 1, d.y, 2, len, 1).fill({ color: 0x4a2414, alpha: 0.95 });
        a.circle(d.x, d.y + len + 1, 1.8).fill({ color: 0x4a2414 });
      }
    }
    if (active && f.dust) {
      for (let i = 0; i < f.dust.length; i++) {
        const d = this.at(f.dust[i]);
        for (let k = 0; k < 4; k++) {
          const ph = (this.t * 1.6 + k * 0.25 + i * 0.13) % 1;
          a.circle(d.x + Math.sin(k * 2.3 + i) * 2.2, d.y + ph * 13, 0.9).fill({ color: 0x7a4a2c, alpha: 1 - ph });
        }
      }
    }
    if (active && f.swirl) {
      const s = this.at(f.swirl);
      const r = this.w * 0.22;
      const rot = this.t * (1.5 + rate * 0.6);
      for (let i = 0; i < 2; i++) {
        const a0 = rot + i * Math.PI;
        a.moveTo(s.x + Math.cos(a0) * r, s.y + Math.sin(a0) * r * 0.28)
          .arc(s.x, s.y, r, a0, a0 + 1.1)
          .stroke({ width: 1.6, color: 0xc98a5a, alpha: 0.55 });
      }
    }

    if (this.needle) this.needle.rotation = active ? -0.8 + Math.sin(this.t * 2.2) * 0.3 + rate * 0.12 : -1.3;
    if (this.pilot) this.pilot.alpha = active ? 0.7 + Math.sin(this.t * 6) * 0.3 : 0.45;

    if (active) {
      this.steamTimer -= dt * Math.max(0.6, rate);
      if (this.steamTimer <= 0) {
        this.steamTimer = 1.1;
        const sp = this.at(f.steam);
        const wp = this.worldPos();
        this.fx.puff(wp.x + sp.x, wp.y + sp.y - 4, 0.5);
      }
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Production floor                                                           */
/* ------------------------------------------------------------------------- */

const STAND = L.floorH - L.slab; // 136
const MACHINE_X = 132;
const DROP_X = 246;
const PROP_X = 284;

export class FloorView extends Container {
  readonly machine: MachineView;
  readonly badge: LevelBadge;
  readonly slot: ManagerSlot;
  private bar = new Bar(112, 8, P.caramel);
  private stack = new Container();
  private stackCount = -1;
  private productTex: Texture;
  private bufferText: LiveText;
  private bufferBar = new Bar(70, 7, P.petrolLight);
  private fullTag = new Tag('LAGER VOLL');
  private hint = bubble('Tippen!');
  private walkers: Walker[] = [];
  private operator: Figure;
  private workerLayer = new Container();
  private t = Math.random() * 5;
  private lastFloat = 0;
  private workers = 0;
  floatText: ((x: number, y: number, t: string) => void) | null = null;
  progress = 0;
  running = false;
  stalled = false;

  constructor(
    readonly index: number,
    h: StationHandlers,
    private fx: Fx,
  ) {
    super();
    const art = FLOOR_ART[index];
    this.productTex = tex(art.product);
    this.addChild(roomBackground(art.bg, art.floorLine, STAND, L.floorH), pillar(L.floorH));
    const sep = new Graphics();
    sep.rect(-12, L.floorH - 3, L.interiorW + 12, 3).fill({ color: P.espresso, alpha: 0.85 });
    this.addChild(sep);

    // tap zone (machine) sits under the decorations so HUD pieces keep their taps
    const tapZone = new Container();
    tapZone.hitArea = new Rectangle(66, 18, 150, 124);
    tapZone.eventMode = 'static';
    tapZone.cursor = 'pointer';
    tapZone.on('pointertap', (e) => {
      const p = this.toLocal(e.global);
      h.tap(this.x + p.x, this.y + p.y);
    });
    this.addChild(tapZone);

    // storage furniture and stacked products
    const prop = sprite(art.prop);
    fit(prop, 76, 56);
    prop.position.set(PROP_X, STAND + 1);
    const propShadow = shadow(prop.width * 1.05, 0.5);
    propShadow.position.set(PROP_X, STAND + 1);
    this.addChild(propShadow, prop, this.stack);

    // machine
    this.machine = new MachineView(index, 122, 100, fx, () => ({ x: this.x + MACHINE_X, y: this.y + STAND + 2 }));
    this.machine.position.set(MACHINE_X, STAND + 2);
    this.addChild(this.machine);

    // workers: operator stands at the output, carriers shuttle to storage
    this.operator = new Figure(art.operator, 49, false);
    this.operator.position.set(214, STAND + 2);
    this.operator.visible = false;
    this.addChild(this.workerLayer);
    this.workerLayer.addChild(this.operator);

    // labels
    const name = hangingPlate(`${index + 1} · ${FLOOR_SHORT[index]}`);
    name.position.set(L.interiorW - (name as Container & { w: number }).w - 8, 16);
    this.addChild(name);
    this.bufferText = liveLabel({ fontSize: 11.5, stroke: { color: P.espresso, width: 3.5 } });
    this.bufferText.anchor.set(0.5, 1);
    this.bufferText.position.set(PROP_X, 64);
    this.bufferBar.position.set(PROP_X - 35, 66);
    this.fullTag.position.set(PROP_X, 58);
    this.addChild(this.bufferText, this.bufferBar);

    this.bar.position.set(MACHINE_X - 56, STAND + 3);
    this.addChild(this.bar);

    this.slot = new ManagerSlot(h.slotTap);
    this.slot.position.set(36, 50);
    this.badge = new LevelBadge(h.openStation);
    this.badge.position.set(6, STAND - 44);
    this.hint.position.set(MACHINE_X, 30);
    this.addChild(this.slot, this.badge, this.fullTag, this.hint);
    this.setWorkers(1);
  }

  setWorkers(n: number) {
    if (n === this.workers) return;
    this.workers = n;
    this.operator.visible = n >= 2;
    const carriers = n >= 2 ? n - 1 : 1;
    while (this.walkers.length < carriers) {
      const k = this.walkers.length;
      const w = new Walker(k % 2 === 0 ? 'arbeiter' : 'arbeiterin', 47);
      w.position.set(this.homeX(k), STAND + 3 + (k % 2) * 1.5);
      this.walkers.push(w);
      this.workerLayer.addChild(w);
      if (this.workers > 1) this.fx.sparks(this.x + w.x, this.y + STAND - 26, 10);
    }
  }

  private homeX(k: number) {
    return 168 + (k % 5) * 9 + Math.floor(k / 5) * 4;
  }

  /** A batch was finished in the simulation. */
  onBatch(text: string) {
    this.machine.pulse();
    const now = performance.now();
    if (now - this.lastFloat > 1150) {
      this.lastFloat = now;
      this.floatText?.(this.x + MACHINE_X, this.y + 40, text);
    }
    const w = this.walkers.find((x) => !x.walking);
    if (!w) return;
    const k = this.walkers.indexOf(w);
    w.walkTo(DROP_X + (k % 2) * 3, () => {
      this.fx.dust(this.x + DROP_X + 10, this.y + STAND);
      w.walkTo(this.homeX(k));
    });
  }

  private setStack(fill: number) {
    const n = fill <= 0 ? 0 : Math.max(1, Math.min(6, Math.ceil(fill * 6)));
    if (n === this.stackCount) return;
    this.stackCount = n;
    this.stack.removeChildren();
    const spots: V2[] = [
      [PROP_X - 20, STAND + 3],
      [PROP_X, STAND + 4],
      [PROP_X + 20, STAND + 3],
      [PROP_X - 10, STAND - 12],
      [PROP_X + 10, STAND - 12],
      [PROP_X, STAND - 27],
    ];
    for (let i = 0; i < n; i++) {
      const s = new Sprite(this.productTex);
      s.anchor.set(0.5, 1);
      fit(s, 19, 18);
      s.position.set(spots[i][0], spots[i][1]);
      this.stack.addChild(s);
    }
  }

  sync(o: {
    level: number;
    affordable: boolean;
    workers: number;
    tier: number;
    progress: number;
    running: boolean;
    stalled: boolean;
    bufferFill: number;
    bufferLabel: string;
    showHint: boolean;
  }) {
    this.badge.setLevel(o.level);
    this.badge.setAffordable(o.affordable);
    this.setWorkers(o.workers);
    this.machine.setTier(o.tier);
    this.progress = o.progress;
    this.running = o.running;
    this.stalled = o.stalled;
    this.bar.set(o.progress, o.stalled ? P.burgundyLight : P.caramel);
    this.setStack(o.bufferFill);
    this.bufferText.value = o.bufferLabel;
    this.bufferText.visible = !o.stalled;
    this.bufferBar.set(o.bufferFill, o.bufferFill > 0.95 ? P.burgundyLight : P.petrolLight);
    this.fullTag.visible = o.stalled;
    this.hint.visible = o.showHint;
  }

  update(dt: number, cyclesPerSecond: number) {
    this.t += dt;
    const active = this.running && !this.stalled;
    this.machine.update(dt, cyclesPerSecond, active);
    const speed = 50 + Math.min(110, cyclesPerSecond * 30);
    for (const w of this.walkers) {
      w.speed = speed;
      w.update(dt);
    }
    this.operator.update(dt, active);
    this.badge.update(dt);
    this.slot.update(dt);
    this.fullTag.update(dt);
    if (this.hint.visible) this.hint.y = 30 + Math.sin(this.t * 5) * 3;
  }
}

/* ------------------------------------------------------------------------- */
/* Construction site                                                          */
/* ------------------------------------------------------------------------- */

export class ConstructionView extends Container {
  private btn = new Graphics();
  private cost: LiveText;
  private nameText: Text;
  private chain: Container;
  private btnHolder = new Container();
  private t = 0;
  private affordable: boolean | null = null;
  floor = -1;

  constructor(onTap: () => void) {
    super();
    // the empty, not yet furnished hall behind the scaffold (painted "Werkstatt" backdrop, dimmed)
    const hall = roomBackground('hintergruende/werkstatt_alternativ', 510, STAND, L.floorH);
    const back = new Graphics();
    back.rect(0, 0, L.interiorW, L.floorH).fill({ color: P.espresso, alpha: 0.42 });
    back.rect(0, L.floorH - 10, L.interiorW, 10).fill(P.espressoLight);
    const scaffold = sprite('gebaeude/baugeruest');
    fit(scaffold, L.interiorW + 10, L.floorH - 4);
    scaffold.position.set(L.interiorW / 2, L.floorH);
    this.chain = new Container();
    const hoist = sprite('requisiten/kettenzug', 0.5, 0);
    fit(hoist, 30, 60);
    const box = sprite('logistik/versandkisten', 0.5, 0);
    fit(box, 26, 26);
    box.y = hoist.height - 6;
    this.chain.addChild(hoist, box);
    this.chain.position.set(48, -6);
    this.addChild(hall, back, scaffold, this.chain, pillar(L.floorH));

    const title = label('NEUE ETAGE', { fontSize: 10, letterSpacing: 1.2, fill: P.brassLight, stroke: { color: P.espresso, width: 3 } });
    title.anchor.set(0.5);
    title.position.set(170, 30);
    this.nameText = label('', { fontFamily: DISPLAY, fontSize: 17, fontWeight: '800', fill: P.ivory, stroke: { color: P.espresso, width: 4 } });
    this.nameText.anchor.set(0.5);
    this.nameText.position.set(170, 50);
    const lock = sprite('oberflaeche/gesperrt', 0.5, 0.5);
    fit(lock, 20, 20);
    lock.position.set(-46, 0);
    const bl = label('Bauen', { fontSize: 12, fill: P.ivory });
    bl.anchor.set(0.5);
    bl.position.set(10, -7);
    this.cost = liveLabel({ fontSize: 13.5, fontFamily: DISPLAY, fontWeight: '700', fill: P.brassLight });
    this.cost.anchor.set(0.5);
    this.cost.position.set(10, 8);
    this.btnHolder.addChild(this.btn, lock, bl, this.cost);
    this.btnHolder.position.set(170, 96);
    this.addChild(title, this.nameText, this.btnHolder);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, L.interiorW, L.floorH);
    this.on('pointertap', onTap);
  }

  sync(floor: number, costLabel: string, affordable: boolean) {
    this.floor = floor;
    this.nameText.text = `${floor + 1} · ${FLOOR_SHORT[floor]}`;
    this.cost.value = costLabel;
    if (affordable !== this.affordable) {
      this.affordable = affordable;
      this.btn.clear();
      plate(this.btn, -66, -21, 132, 42, affordable ? P.petrol : P.espressoLight, 13);
    }
  }

  update(dt: number) {
    this.t += dt;
    this.btnHolder.scale.set(this.affordable ? 1 + Math.sin(this.t * 5) * 0.045 : 1);
    this.chain.rotation = Math.sin(this.t * 1.3) * 0.06;
  }
}

/* ------------------------------------------------------------------------- */
/* Roof                                                                       */
/* ------------------------------------------------------------------------- */

export class RoofView extends Container {
  private smokeTimer = 0;
  private chimneys: V2[] = [];

  constructor(private fx: Fx) {
    super();
    const roof = sprite('gebaeude/fabrikdach');
    const w = L.towerW + 52;
    roof.width = w;
    roof.scale.y = roof.scale.x;
    roof.position.set(L.towerW / 2, L.roofH + 6);
    const top = L.roofH + 6 - roof.height;
    this.chimneys = [
      [L.towerW / 2 - w / 2 + 0.27 * w, top + 2],
      [L.towerW / 2 - w / 2 + 0.69 * w, top + 2],
    ];
    const title = label('COCOA CROWN', { fontFamily: DISPLAY, fontSize: 30, fontWeight: '900', fill: P.brassLight, stroke: { color: P.espresso, width: 6, join: 'round' }, letterSpacing: 1.5, dropShadow: { color: 0x000000, alpha: 0.35, distance: 3, blur: 2, angle: Math.PI / 2 } });
    title.anchor.set(0.5);
    title.position.set(L.towerW / 2, top - 30);
    const crownIcon = sprite('oberflaeche/krone', 0.5, 1);
    fit(crownIcon, 34, 28);
    crownIcon.position.set(L.towerW / 2, top - 46);
    const sub = label('Schokoladen-Manufaktur', { fontFamily: DISPLAY, fontSize: 11.5, fontWeight: '700', fill: P.ivory, stroke: { color: P.espresso, width: 3.5 } });
    sub.anchor.set(0.5);
    sub.position.set(L.towerW / 2, top + 4);
    this.addChild(roof, crownIcon, title, sub);
  }

  update(dt: number, _liftSpeed: number, chimneyActive: boolean) {
    if (!chimneyActive) return;
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.9;
      for (const [x, y] of this.chimneys) this.fx.puff(this.x + x, this.y + y, 0.7);
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Ground floor: Versandlager, lift and van HUD                               */
/* ------------------------------------------------------------------------- */

const G_STAND = L.groundH - L.slab; // 146

export class GroundView extends Container {
  readonly shipBadge: LevelBadge;
  readonly shipSlot: ManagerSlot;
  readonly liftBadge: LevelBadge;
  readonly liftSlot: ManagerSlot;
  private crates = new Container();
  private crateCount = -1;
  private depotText: LiveText;
  private depotBar = new Bar(96, 7, P.petrolLight);
  private fullTag = new Tag('LAGER VOLL');
  private parcel: Sprite;
  private parcelTime = 0;
  private driver: Figure;
  private t = 0;

  constructor(h: { tapShip: (x: number, y: number) => void; openShip: () => void; slotShip: () => void; openLift: () => void; slotLift: () => void; tapLift: (x: number, y: number) => void }) {
    super();
    this.addChild(roomBackground('hintergruende/etage_versand', 446, G_STAND, L.groundH), pillar(L.groundH));

    const shipZone = new Container();
    shipZone.hitArea = new Rectangle(0, 20, 236, L.groundH - 20);
    shipZone.eventMode = 'static';
    shipZone.cursor = 'pointer';
    shipZone.on('pointertap', (e) => {
      const p = this.toLocal(e.global);
      h.tapShip(this.x + p.x, this.y + p.y);
    });
    const liftZone = new Container();
    liftZone.hitArea = new Rectangle(236, 20, L.interiorW - 236, L.groundH - 20);
    liftZone.eventMode = 'static';
    liftZone.cursor = 'pointer';
    liftZone.on('pointertap', (e) => {
      const p = this.toLocal(e.global);
      h.tapLift(this.x + p.x, this.y + p.y);
    });
    this.addChild(shipZone, liftZone);

    const clock = sprite('requisiten/wanduhr', 0.5, 0);
    fit(clock, 30, 32);
    clock.position.set(236, 12);
    const hoist = sprite('requisiten/kettenzug', 0.5, 0);
    fit(hoist, 22, 46);
    hoist.position.set(308, 4);
    const lampL = sprite('requisiten/wandleuchte', 0.5, 0);
    fit(lampL, 22, 24);
    lampL.position.set(150, 52);
    this.addChild(clock, hoist, lampL, this.crates);

    this.driver = new Figure('figuren/fahrer', 45, false);
    this.driver.position.set(104, G_STAND + 2);
    this.addChild(this.driver);

    this.parcel = sprite('produkte/lieferpaket');
    fit(this.parcel, 18, 16);
    this.parcel.visible = false;
    this.addChild(this.parcel);

    const name = hangingPlate('Versandlager');
    name.position.set(178 - (name as Container & { w: number }).w / 2, 14);
    this.addChild(name);
    this.depotText = liveLabel({ fontSize: 11.5, stroke: { color: P.espresso, width: 3.5 } });
    this.depotText.anchor.set(0.5, 1);
    this.depotText.position.set(196, 70);
    this.depotBar.position.set(148, 72);
    this.fullTag.position.set(196, 64);
    this.addChild(this.depotText, this.depotBar);

    this.shipSlot = new ManagerSlot(h.slotShip);
    this.shipSlot.position.set(38, 66);
    this.shipBadge = new LevelBadge(h.openShip);
    this.shipBadge.position.set(6, G_STAND - 44);
    this.liftSlot = new ManagerSlot(h.slotLift);
    this.liftSlot.position.set(286, 66);
    this.liftBadge = new LevelBadge(h.openLift);
    this.liftBadge.position.set(250, G_STAND - 44);
    const shipCap = label('VERSAND', { fontSize: 9, letterSpacing: 1, fill: P.brassLight, stroke: { color: P.espresso, width: 3 } });
    shipCap.anchor.set(0.5);
    shipCap.position.set(38, 33);
    const liftCap = label('AUFZUG', { fontSize: 9, letterSpacing: 1, fill: P.brassLight, stroke: { color: P.espresso, width: 3 } });
    liftCap.anchor.set(0.5);
    liftCap.position.set(286, 33);
    this.addChild(shipCap, liftCap, this.shipSlot, this.shipBadge, this.liftSlot, this.liftBadge, this.fullTag);
  }

  setDepot(fill: number, labelText: string, full: boolean) {
    const n = fill <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(fill * 4)));
    this.depotText.value = labelText;
    this.depotText.visible = !full;
    this.depotBar.set(fill, fill > 0.95 ? P.burgundyLight : P.petrolLight);
    this.fullTag.visible = full;
    if (n === this.crateCount) return;
    this.crateCount = n;
    this.crates.removeChildren();
    const xs = [176, 214, 156, 196];
    for (let i = 0; i < n; i++) {
      const c = sprite('logistik/versandkisten');
      fit(c, 40, 46);
      c.position.set(xs[i], G_STAND + (i >= 2 ? 3 : 0));
      this.crates.addChildAt(c, i >= 2 ? this.crates.children.length : 0);
    }
  }

  conveyor() {
    this.parcelTime = 0.8;
  }

  update(dt: number) {
    this.t += dt;
    if (this.parcelTime > 0) {
      this.parcelTime -= dt;
      const p = 1 - Math.max(0, this.parcelTime) / 0.8;
      this.parcel.visible = true;
      this.parcel.position.set(318 - p * 70, G_STAND + 1 - Math.sin(p * Math.PI) * 4);
    } else this.parcel.visible = false;
    this.driver.update(dt, false);
    this.shipBadge.update(dt);
    this.liftBadge.update(dt);
    this.shipSlot.update(dt);
    this.liftSlot.update(dt);
    this.fullTag.update(dt);
  }
}

/* ------------------------------------------------------------------------- */
/* Lift shaft and car                                                         */
/* ------------------------------------------------------------------------- */

export class LiftView extends Container {
  private back = new Graphics();
  private frame = new Container();
  private frameMask = new Graphics();
  private cable = new Graphics();
  private counter = new Graphics();
  readonly car = new Container();
  private cargo = new Container();
  private cargoCount = -1;
  private winch: Sprite;
  private top = 0;
  private bottom = 0;
  private tag = new Tag('ENGPASS');
  private carH: number;

  constructor(onTap: (x: number, y: number) => void) {
    super();
    const body = sprite('logistik/lastenaufzug');
    fit(body, 58, 86);
    this.carH = body.height;
    this.car.addChild(body, this.cargo);
    this.tag.position.set(0, -this.carH - 14);
    this.car.addChild(this.tag);
    this.car.position.set(L.shaftX + L.shaftW / 2, 0);
    this.frame.mask = this.frameMask;
    this.winch = sprite('logistik/winde');
    fit(this.winch, 64, 70);
    this.addChild(this.back, this.counter, this.cable, this.car, this.frame, this.frameMask, this.winch);
    this.back.eventMode = 'static';
    this.back.cursor = 'pointer';
    this.back.on('pointertap', (e) => {
      const p = this.toLocal(e.global);
      onTap(p.x, p.y);
    });
  }

  layout(top: number, bottom: number) {
    this.top = top;
    this.bottom = bottom;
    const x = L.shaftX;
    const w = L.shaftW;
    this.back.clear();
    this.back.rect(x, top, w, bottom - top).fill(0x24140f);
    this.back.rect(x + 8, top, w - 16, bottom - top).fill(0x341d15);
    for (let y = top + 12; y < bottom; y += 18) this.back.rect(x + 8, y, w - 16, 1).fill({ color: 0x000000, alpha: 0.25 });
    this.back.rect(x + w, top, 6, bottom - top).fill(P.burgundyDark);
    this.back.hitArea = new Rectangle(x, top, w, bottom - top);
    // painted shaft frame, tiled
    this.frame.removeChildren();
    const sample = sprite('gebaeude/aufzugsschacht', 0.5, 0);
    const tw = w + 6;
    const k = tw / sample.texture.width;
    const th = sample.texture.height * k;
    for (let y = top - 4; y < bottom; y += th - 2) {
      const s = sprite('gebaeude/aufzugsschacht', 0.5, 0);
      s.scale.set(k);
      s.position.set(x + w / 2, y);
      this.frame.addChild(s);
    }
    this.frameMask.clear().rect(x - 4, top, w + 8, bottom - top).fill(0xffffff);
    this.winch.position.set(x + w / 2, top + 8);
  }

  sync(y: number, cargoFill: number, bottleneck: boolean) {
    this.car.y = y;
    const n = cargoFill <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(cargoFill * 4)));
    if (n !== this.cargoCount) {
      this.cargoCount = n;
      this.cargo.removeChildren();
      const spots: V2[] = [
        [-12, -5],
        [6, -5],
        [-3, -18],
        [14, -18],
      ];
      for (let i = 0; i < n; i++) {
        const p = sprite('produkte/lieferpaket');
        fit(p, 18, 15);
        p.position.set(spots[i][0], spots[i][1]);
        this.cargo.addChild(p);
      }
    }
    this.tag.visible = bottleneck;
    const cx = L.shaftX + L.shaftW / 2;
    this.cable.clear();
    this.cable.moveTo(cx - 2, this.top + 30).lineTo(cx - 2, y - this.carH + 2).stroke({ width: 1.6, color: 0x1a0e0a });
    this.cable.moveTo(cx + 2, this.top + 30).lineTo(cx + 2, y - this.carH + 2).stroke({ width: 1.6, color: 0x1a0e0a });
    const cwY = this.top + (this.bottom - y) * 0.5 + 40;
    this.counter.clear();
    this.counter.moveTo(L.shaftX + 13, this.top + 30).lineTo(L.shaftX + 13, cwY).stroke({ width: 1.4, color: 0x1a0e0a });
    plate(this.counter, L.shaftX + 7, cwY, 12, 28, P.burgundy, 3);
  }

  update(dt: number) {
    this.tag.update(dt);
  }
}

/* ------------------------------------------------------------------------- */
/* Delivery vans                                                              */
/* ------------------------------------------------------------------------- */

export class Van extends Container {
  private body: Sprite;
  private t = Math.random() * 10;
  private k: number;
  facingLeft = true;
  constructor() {
    super();
    this.body = sprite('logistik/lieferwagen');
    this.k = fit(this.body, 86, 52);
    this.addChild(shadow(80, 0.55), this.body);
  }
  update(dt: number, speed: number) {
    this.t += dt;
    this.body.scale.x = this.k * (this.facingLeft ? -1 : 1);
    this.body.y = speed !== 0 ? Math.sin(this.t * 22) * 0.5 - Math.abs(Math.sin(this.t * 7)) * 0.4 : 0;
    this.body.rotation = speed !== 0 ? Math.sin(this.t * 11) * 0.006 : 0;
  }
}

export function vanSlotX(k: number): number {
  return 50 + k * 78;
}
