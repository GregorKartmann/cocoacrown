import { Container, Sprite } from 'pixi.js';
import type { Decor } from '../config/winter';
import { subTex, tex } from './assets';

const KEY_STRING = 'winter/deko/lichterkette_turm';
import { L, type WorldLayout } from './layout';

/**
 * Winter decoration from the Advent calendar, drawn over the tower (tower
 * coordinates). The snowy roof and the garland belong to their views (they
 * sit behind texts); snowfall lives in screen space (see Snowfall).
 */
export class WinterDecor extends Container {
  private arcs: Sprite[] = [];
  private strings: Container[] = [new Container(), new Container()];
  private tree: Sprite;
  private t = 0;
  private shown = new Set<Decor>();
  private height_ = 0;

  constructor() {
    super();
    for (let i = 0; i < 2; i++) {
      const a = new Sprite(tex('winter/deko/lichterkette_bogen'));
      a.anchor.set(0.5, 0);
      this.arcs.push(a);
      this.addChild(a);
    }
    this.addChild(...this.strings);
    this.tree = new Sprite(tex('winter/deko/weihnachtsbaum'));
    this.tree.anchor.set(0.5, 1);
    this.addChild(this.tree);
    this.apply(new Set(), null);
  }

  apply(decor: Set<Decor>, lay: WorldLayout | null, roofY = 0) {
    this.shown = decor;
    const arc = decor.has('lichterbogen');
    const strings = decor.has('lichterturm');
    const tree = decor.has('baum');
    this.visible = arc || strings || tree;
    for (const a of this.arcs) a.visible = arc;
    for (const s of this.strings) s.visible = strings;
    this.tree.visible = tree;
    if (!lay) return;
    const gutter = roofY + L.roofH - 4;
    // two shallow swags under the roof gutter, one per half of the facade
    const w = L.towerW / 2 - 6;
    this.arcs.forEach((a, i) => {
      a.width = w;
      a.height = w * (144 / 644) * 0.9;
      a.position.set(L.towerW / 4 + (i ? L.towerW / 2 : 0) + (i ? -3 : 3), gutter - 2);
    });
    // light strings down both tower edges, roof gutter to the street
    const bottom = lay.groundY + L.groundH - 6;
    if (Math.abs(this.height_ - (bottom - gutter)) > 1) {
      this.height_ = bottom - gutter;
      const t = tex(KEY_STRING);
      this.strings.forEach((c, side) => {
        c.removeChildren();
        const k = 12 / t.width;
        const tileH = t.height * k;
        for (let y = 0; y < this.height_ - 20; y += tileH - 6) {
          const frac = Math.min(1, (this.height_ - y) / tileH);
          const s = new Sprite(frac >= 0.999 ? t : subTex(KEY_STRING, 0, 0, t.width, Math.max(1, Math.floor(t.height * frac))));
          s.scale.set(k);
          s.position.set(0, y);
          c.addChild(s);
        }
        c.position.set(side ? L.towerW - 6 : -12, gutter + 2);
      });
    }
    this.strings.forEach((c) => (c.y = gutter + 2));
    // tree on the roof terrace, left of the lettering (the event button sits on the right)
    const tk = 92 / this.tree.texture.height;
    this.tree.scale.set(tk);
    this.tree.position.set(44, roofY + 126);
  }

  update(dt: number) {
    if (!this.visible) return;
    this.t += dt;
    // gentle twinkle: the two halves and the two strings pulse out of phase
    const p = (o: number) => 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(this.t * 2.2 + o));
    if (this.shown.has('lichterbogen')) this.arcs.forEach((a, i) => (a.alpha = p(i * 1.7)));
    if (this.shown.has('lichterturm')) this.strings.forEach((c, i) => (c.alpha = p(0.9 + i * 2.3)));
  }
}

interface Flake {
  s: Sprite;
  vy: number;
  sway: number;
  phase: number;
  x: number;
}

/** Light snowfall in screen space, in front of the tower. */
export class Snowfall extends Container {
  private flakes: Flake[] = [];
  private w = 0;
  private h = 0;
  private t = 0;

  constructor(count = 46) {
    super();
    const t = tex('winter/effekte/schneeflocke');
    for (let i = 0; i < count; i++) {
      const s = new Sprite(t);
      s.anchor.set(0.5);
      const depth = Math.random();
      const size = 5 + depth * 9;
      s.scale.set(size / t.height);
      s.alpha = 0.55 + depth * 0.4;
      this.flakes.push({ s, vy: 18 + depth * 34, sway: 8 + depth * 14, phase: Math.random() * 6.28, x: Math.random() });
      this.addChild(s);
    }
    this.visible = false;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    for (const f of this.flakes) f.s.y = Math.random() * h;
  }

  update(dt: number) {
    if (!this.visible) return;
    this.t += dt;
    for (const f of this.flakes) {
      f.s.y += f.vy * dt;
      if (f.s.y > this.h + 10) {
        f.s.y = -10;
        f.x = Math.random();
      }
      f.s.x = f.x * this.w + Math.sin(this.t * 0.9 + f.phase) * f.sway;
      f.s.rotation += dt * 0.4;
    }
  }
}
