import { Container, Graphics, Sprite, Text, type Texture, type Renderer } from 'pixi.js';
import { P } from './palette';
import { DISPLAY } from './hud';
import { tex } from './assets';

export type ParticleKind = 'coin' | 'steam' | 'spark' | 'confetti' | 'dust';

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  spin: number;
  fade: boolean;
  grow: number;
  /** Fly-to target (screen space coins). */
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  ctrl?: { x: number; y: number };
  done?: () => void;
}

/**
 * Pooled particle system. A hard cap keeps phones at 60 FPS even when many
 * events fire at once (reduced automatically in low-power mode).
 */
export class Particles extends Container {
  private textures: Record<ParticleKind, Texture>;
  private pool: Sprite[] = [];
  private live: Particle[] = [];
  private anims: { s: Sprite; t: number; kind: 'puff' | 'burst'; base: number; frames?: Texture[]; max: number; vy: number }[] = [];
  private animPool: Sprite[] = [];
  private coinScale = 1;
  max = 220;

  constructor(renderer: Renderer) {
    super();
    const make = (g: Graphics) => renderer.generateTexture({ target: g, resolution: 2, antialias: true });
    const steam = new Graphics();
    steam.circle(0, 0, 8).fill({ color: 0xffffff, alpha: 0.85 });
    const spark = new Graphics();
    spark.star(0, 0, 4, 7, 2.6).fill(P.brassLight);
    const conf = new Graphics();
    conf.rect(-3, -1.6, 6, 3.2).fill(0xffffff);
    const dust = new Graphics();
    dust.circle(0, 0, 4).fill({ color: 0xcdb79a, alpha: 0.9 });
    this.textures = { coin: tex('oberflaeche/muenze'), steam: make(steam), spark: make(spark), confetti: make(conf), dust: make(dust) };
    this.coinScale = 16 / this.textures.coin.width;
  }

  private take(kind: ParticleKind): Sprite | null {
    if (this.live.length >= this.max) return null;
    const s = this.pool.pop() ?? new Sprite();
    s.texture = this.textures[kind];
    s.anchor.set(0.5);
    s.alpha = 1;
    s.rotation = 0;
    s.scale.set(0.5);
    s.tint = 0xffffff;
    s.visible = true;
    this.addChild(s);
    return s;
  }

  spawn(kind: ParticleKind, x: number, y: number, count: number, opts: { spread?: number; up?: number; tint?: number[]; life?: number; scale?: number } = {}) {
    for (let i = 0; i < count; i++) {
      const s = this.take(kind);
      if (!s) return;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * (opts.spread ?? 2.2);
      const sp = (opts.up ?? 120) * (0.5 + Math.random() * 0.7);
      s.position.set(x, y);
      if (opts.tint) s.tint = opts.tint[Math.floor(Math.random() * opts.tint.length)];
      const base = opts.scale ?? 1;
      s.scale.set(base * (0.6 + Math.random() * 0.5));
      const p: Particle = {
        s,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: kind === 'steam' ? -18 : kind === 'spark' ? 60 : 380,
        life: 0,
        max: (opts.life ?? (kind === 'steam' ? 1.6 : 0.9)) * (0.8 + Math.random() * 0.4),
        spin: (Math.random() - 0.5) * (kind === 'confetti' ? 14 : 4),
        fade: true,
        grow: kind === 'steam' ? 1.6 : 0,
      };
      this.live.push(p);
    }
  }

  private takeAnim(): Sprite | null {
    if (this.anims.length > 60) return null;
    const s = this.animPool.pop() ?? new Sprite();
    s.alpha = 1;
    s.rotation = 0;
    s.visible = true;
    this.addChild(s);
    return s;
  }

  /** Painted three-phase steam puff. */
  puff(x: number, y: number, scale = 0.6) {
    const s = this.takeAnim();
    if (!s) return;
    const frames = [tex('effekte/dampf_01'), tex('effekte/dampf_02'), tex('effekte/dampf_03')];
    s.texture = frames[0];
    s.anchor.set(0.5, 1);
    const base = (scale * 42) / frames[1].height;
    s.scale.set(base);
    s.position.set(x + (Math.random() - 0.5) * 3, y);
    this.anims.push({ s, t: 0, kind: 'puff', base, frames, max: 0.85, vy: -16 });
  }

  /** One-off effect sprite (beans, chocolate splash, gold shine). */
  burst(key: string, x: number, y: number, size: number) {
    const s = this.takeAnim();
    if (!s) return;
    s.texture = tex(key);
    s.anchor.set(0.5, 0.5);
    const base = size / Math.max(s.texture.width, s.texture.height);
    s.scale.set(base * 0.4);
    s.position.set(x, y);
    s.rotation = (Math.random() - 0.5) * 0.4;
    this.anims.push({ s, t: 0, kind: 'burst', base, max: 0.6, vy: key.endsWith('bohnenwurf') ? -20 : -6 });
  }

  /** Coin that flies along a curve to a target (screen space). */
  flyTo(x: number, y: number, tx: number, ty: number, delay: number, done?: () => void) {
    const s = this.take('coin');
    if (!s) {
      done?.();
      return;
    }
    s.position.set(x, y);
    s.scale.set(this.coinScale * 1.2);
    const ctrl = { x: (x + tx) / 2 + (Math.random() - 0.5) * 140, y: Math.min(y, ty) - 40 - Math.random() * 80 };
    this.live.push({ s, vx: 0, vy: 0, g: 0, life: -delay, max: 0.75, spin: 0, fade: false, grow: 0, from: { x, y }, to: { x: tx, y: ty }, ctrl, done });
  }

  update(dt: number) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = a.t / a.max;
      a.s.y += a.vy * dt;
      if (a.kind === 'puff' && a.frames) {
        a.s.texture = a.frames[Math.min(2, Math.floor(a.t / 0.16))];
        a.s.scale.set(a.base * (1 + k * 0.35));
        a.s.alpha = k < 0.45 ? 0.85 : Math.max(0, 0.85 * (1 - (k - 0.45) / 0.55));
      } else {
        const pop = a.t < 0.12 ? 0.4 + (a.t / 0.12) * 0.75 : 1.15 - Math.min(0.15, (a.t - 0.12) * 0.6);
        a.s.scale.set(a.base * pop);
        a.s.alpha = k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45);
      }
      if (k >= 1) {
        a.s.visible = false;
        this.removeChild(a.s);
        this.animPool.push(a.s);
        this.anims.splice(i, 1);
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      if (p.life < 0) {
        p.s.visible = false;
        continue;
      }
      p.s.visible = true;
      const k = p.life / p.max;
      if (p.to && p.from && p.ctrl) {
        const t = Math.min(1, k);
        const e = t * t * (3 - 2 * t);
        const u = 1 - e;
        p.s.x = u * u * p.from.x + 2 * u * e * p.ctrl.x + e * e * p.to.x;
        p.s.y = u * u * p.from.y + 2 * u * e * p.ctrl.y + e * e * p.to.y;
        p.s.scale.set(this.coinScale * (1.2 - 0.4 * e));
      } else {
        p.vy += p.g * dt;
        p.s.x += p.vx * dt;
        p.s.y += p.vy * dt;
        p.s.rotation += p.spin * dt;
        if (p.grow) p.s.scale.set(p.s.scale.x + p.grow * dt * 0.5);
        if (p.fade) p.s.alpha = Math.max(0, 1 - k * k);
      }
      if (k >= 1) {
        p.done?.();
        p.s.visible = false;
        this.removeChild(p.s);
        this.pool.push(p.s);
        this.live.splice(i, 1);
      }
    }
  }
}

interface Floater {
  t: Text;
  life: number;
  max: number;
  vy: number;
}

/** Rising and fading numbers ("+120 €"). */
export class FloatingTexts extends Container {
  private pool: Text[] = [];
  private live: Floater[] = [];

  spawn(x: number, y: number, text: string, color: number, size = 15, max = 1.15) {
    if (this.live.length > 40) return;
    const t =
      this.pool.pop() ??
      new Text({
        text: '',
        style: { fontFamily: DISPLAY, fontSize: 15, fill: P.ivory, fontWeight: '800', stroke: { color: P.espresso, width: 4, join: 'round' } },
      });
    t.text = text;
    t.style.fill = color;
    t.style.fontSize = size;
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.alpha = 1;
    t.scale.set(0.6);
    this.addChild(t);
    this.live.push({ t, life: 0, max, vy: -34 });
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      f.life += dt;
      const k = f.life / f.max;
      f.t.y += f.vy * dt;
      const pop = Math.min(1, f.life / 0.12);
      f.t.scale.set(0.6 + 0.4 * pop + (k < 0.2 ? 0.08 * Math.sin((k / 0.2) * Math.PI) : 0));
      f.t.alpha = k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1;
      if (k >= 1) {
        this.removeChild(f.t);
        this.pool.push(f.t);
        this.live.splice(i, 1);
      }
    }
  }
}
