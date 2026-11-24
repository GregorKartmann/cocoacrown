import { Container, Graphics, Rectangle, Sprite, Text, type TextStyleOptions } from 'pixi.js';
import { P } from './palette';
import { tex } from './assets';
import { portraitKey } from '../config/content';
import type { Manager } from '../sim/types';

export const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
export const DISPLAY = 'Fraunces, Georgia, serif';

export function label(text: string, style: TextStyleOptions = {}): Text {
  return new Text({ text, style: { fontFamily: FONT, fontSize: 13, fill: P.ivory, fontWeight: '600', ...style } });
}

/** Text that only re-rasterises when its content changes. */
export class LiveText extends Text {
  private last = '';
  set value(v: string) {
    if (v !== this.last) {
      this.last = v;
      this.text = v;
    }
  }
}

export function liveLabel(style: TextStyleOptions = {}): LiveText {
  return new LiveText({ text: '', style: { fontFamily: FONT, fontSize: 13, fill: P.ivory, fontWeight: '600', ...style } });
}

/** Enamel plate with brass rim – the shared look of all in-world HUD pieces. */
export function plate(g: Graphics, x: number, y: number, w: number, h: number, color: number, r = 9): Graphics {
  g.roundRect(x + 1, y + 3, w, h, r).fill({ color: 0x000000, alpha: 0.3 });
  g.roundRect(x, y, w, h, r).fill(P.brassDark);
  g.roundRect(x + 1.6, y + 1.6, w - 3.2, h - 3.2, r - 1.5).fill(P.brass);
  g.roundRect(x + 3, y + 3, w - 6, h - 6, r - 3).fill(color);
  g.roundRect(x + 5, y + 4, w - 10, Math.max(2, h * 0.22), r - 4).fill({ color: 0xffffff, alpha: 0.16 });
  return g;
}

/** Tappable level badge; turns petrol and pulses when an upgrade is affordable. */
export class LevelBadge extends Container {
  private bg = new Graphics();
  private txt = liveLabel({ fontSize: 16, fontFamily: DISPLAY, fontWeight: '700' });
  private cap = label('LEVEL', { fontSize: 8, fill: P.brassLight, letterSpacing: 0.8 });
  private icon = new Sprite(tex('oberflaeche/upgrade'));
  private affordable: boolean | null = null;
  private t = 0;
  readonly w: number;
  readonly h: number;

  constructor(onTap: () => void, w = 68, h = 38) {
    super();
    this.w = w;
    this.h = h;
    this.icon.anchor.set(0.5);
    this.icon.height = 24;
    this.icon.scale.x = this.icon.scale.y;
    this.icon.position.set(17, h / 2);
    this.cap.anchor.set(0.5, 0);
    this.cap.position.set(w * 0.64, 5);
    this.txt.anchor.set(0.5, 0);
    this.txt.position.set(w * 0.64, 13);
    this.addChild(this.bg, this.icon, this.cap, this.txt);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-8, -8, w + 16, h + 16);
    this.on('pointertap', onTap);
    this.setAffordable(false);
  }

  setLevel(level: number) {
    this.txt.value = `${level}`;
  }

  setAffordable(a: boolean) {
    if (a === this.affordable) return;
    this.affordable = a;
    this.bg.clear();
    plate(this.bg, 0, 0, this.w, this.h, a ? P.petrol : P.espressoLight, 11);
    this.icon.alpha = a ? 1 : 0.55;
  }

  update(dt: number) {
    this.t += dt;
    const s = this.affordable ? 1 + Math.sin(this.t * 5) * 0.035 : 1;
    this.scale.set(s);
    this.icon.y = this.h / 2 + (this.affordable ? Math.sin(this.t * 5) * 1.6 : 0);
  }
}

/** Round manager slot with painted portrait and a brass skill ring. */
export class ManagerSlot extends Container {
  private ring = new Graphics();
  private base = new Graphics();
  private plus = new Graphics();
  private sprite = new Sprite();
  private clip = new Graphics();
  private caption = label('Manager', { fontSize: 8.5, fill: P.ivory, stroke: { color: P.espresso, width: 3 } });
  private currentKey = '';
  private t = 0;
  private st = { has: false, ready: false, active: 0, cooldown: 0, total: 1 };

  constructor(
    onTap: () => void,
    private r = 21,
  ) {
    super();
    this.base.circle(0, 2.5, r + 1).fill({ color: 0x000000, alpha: 0.3 });
    this.base.circle(0, 0, r + 1).fill(P.brassDark);
    this.base.circle(0, 0, r - 0.6).fill(P.brass);
    this.base.circle(0, 0, r - 3).fill(P.ivory2);
    this.plus.roundRect(-2.8, -9, 5.6, 18, 2).fill(P.petrol);
    this.plus.roundRect(-9, -2.8, 18, 5.6, 2).fill(P.petrol);
    this.clip.circle(0, 0, r - 3).fill(0xffffff);
    this.sprite.anchor.set(0.5);
    this.sprite.mask = this.clip;
    this.caption.anchor.set(0.5, 0);
    this.caption.position.set(0, r + 2);
    this.addChild(this.ring, this.base, this.plus, this.sprite, this.clip, this.caption);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-r - 8, -r - 8, 2 * r + 16, 2 * r + 22);
    this.on('pointertap', onTap);
  }

  setManager(m: Manager | null, activeTotal: number, cooldownTotal: number) {
    const key = m ? portraitKey(m.name, m.category, m.look.hair) : '';
    if (key !== this.currentKey) {
      this.currentKey = key;
      this.sprite.visible = !!m;
      this.plus.visible = !m;
      if (m) {
        this.sprite.texture = tex(key);
        const s = ((this.r - 3) * 2.15) / this.sprite.texture.width;
        this.sprite.scale.set(s);
        this.sprite.y = 2;
      }
    }
    this.st = {
      has: !!m,
      ready: !!m && m.skillCooldown <= 0 && m.skillActive <= 0,
      active: m ? m.skillActive : 0,
      cooldown: m ? m.skillCooldown / cooldownTotal : 0,
      total: activeTotal,
    };
    this.caption.text = m ? (this.st.ready ? 'Bereit!' : this.st.active > 0 ? 'Aktiv' : 'Pause') : 'Manager';
    this.caption.style.fill = m && this.st.ready ? P.brassLight : P.ivory;
  }

  update(dt: number) {
    this.t += dt;
    const g = this.ring;
    const r = this.r + 4;
    g.clear();
    const s = this.st;
    if (!s.has) {
      const k = 0.5 + Math.sin(this.t * 4) * 0.5;
      g.circle(0, 0, r).stroke({ width: 3, color: P.brassLight, alpha: 0.3 + k * 0.5 });
      return;
    }
    if (s.active > 0) {
      const frac = Math.min(1, s.active / Math.max(1, s.total));
      g.circle(0, 0, r + 2).fill({ color: P.brassLight, alpha: 0.3 + Math.sin(this.t * 10) * 0.12 });
      g.moveTo(0, -r).arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).stroke({ width: 4, color: P.brassLight, cap: 'round' });
    } else if (s.ready) {
      const k = 0.5 + Math.sin(this.t * 5) * 0.5;
      g.circle(0, 0, r + k * 2).stroke({ width: 3.5, color: P.brassLight, alpha: 0.55 + k * 0.45 });
    } else {
      g.circle(0, 0, r).stroke({ width: 3.5, color: P.espresso, alpha: 0.55 });
      g.moveTo(0, -r).arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + (1 - s.cooldown) * Math.PI * 2).stroke({ width: 3.5, color: P.petrolLight, cap: 'round' });
    }
  }
}

/** Brass-framed fill bar. */
export class Bar extends Graphics {
  constructor(
    private w: number,
    private h: number,
    private color: number,
  ) {
    super();
    this.set(0);
  }
  set(frac: number, color = this.color) {
    const f = Math.max(0, Math.min(1, frac));
    this.clear();
    this.roundRect(0, 0, this.w, this.h, this.h / 2).fill(P.brassDark);
    this.roundRect(1.2, 1.2, this.w - 2.4, this.h - 2.4, (this.h - 2.4) / 2).fill(P.espresso);
    if (f > 0.001) {
      const fw = Math.max(this.h - 2.4, (this.w - 2.4) * f);
      this.roundRect(1.2, 1.2, fw, this.h - 2.4, (this.h - 2.4) / 2).fill(color);
      this.roundRect(2.4, 1.8, Math.max(0, fw - 2.4), (this.h - 2.4) * 0.35, 1).fill({ color: 0xffffff, alpha: 0.28 });
    }
  }
}

/** Warning tag like "LAGER VOLL" or "ENGPASS". */
export class Tag extends Container {
  private bg = new Graphics();
  private icon = new Sprite(tex('oberflaeche/engpass'));
  private txt = label('', { fontSize: 9.5, letterSpacing: 0.6 });
  private t = Math.random() * 3;
  constructor(text: string, color = P.burgundy) {
    super();
    this.txt.text = text;
    this.txt.anchor.set(0, 0.5);
    this.icon.anchor.set(0.5);
    this.icon.height = 15;
    this.icon.scale.x = this.icon.scale.y;
    const w = this.txt.width + 34;
    plate(this.bg, -w / 2, -10, w, 20, color, 10);
    this.icon.position.set(-w / 2 + 12, 0);
    this.txt.position.set(-w / 2 + 22, 0);
    this.addChild(this.bg, this.icon, this.txt);
    this.visible = false;
  }
  update(dt: number) {
    this.t += dt;
    if (this.visible) this.scale.set(1 + Math.max(0, Math.sin(this.t * 6)) * 0.06);
  }
}
