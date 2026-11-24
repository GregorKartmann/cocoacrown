import { Container, FillGradient, Graphics, Sprite } from 'pixi.js';
import { subTex, tex } from './assets';
import { C } from './palette';
import { L } from './layout';

/** Screen-space sky with sun and drifting clouds. */
export class Sky extends Container {
  private grad = new Graphics();
  private sun = new Graphics();
  private clouds: { g: Graphics; speed: number; y: number }[] = [];
  private w = 0;
  private h = 0;
  private t = 0;

  constructor() {
    super();
    this.addChild(this.grad, this.sun);
    for (let i = 0; i < 6; i++) {
      const g = new Graphics();
      const s = 0.7 + (i % 3) * 0.25;
      g.alpha = 0.75;
      g.ellipse(0, 0, 46 * s, 16 * s).fill({ color: C.white, alpha: 0.92 });
      g.circle(-18 * s, -8 * s, 16 * s).fill({ color: C.white, alpha: 0.92 });
      g.circle(10 * s, -14 * s, 20 * s).fill({ color: C.white, alpha: 0.92 });
      g.ellipse(0, 6 * s, 44 * s, 8 * s).fill({ color: 0xeaf4fb, alpha: 0.9 });
      g.x = Math.random() * 1200;
      this.clouds.push({ g, speed: 6 + (i % 3) * 4, y: 0.08 + i * 0.11 });
      this.addChild(g);
    }
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const fill = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x7d9fc8 },
        { offset: 0.6, color: 0xb2c3de },
        { offset: 1, color: 0xcacde1 },
      ],
      textureSpace: 'local',
    });
    this.grad.clear().rect(0, 0, w, h).fill(fill);
    this.sun.clear();
    this.sun.circle(0, 0, 70).fill({ color: 0xfff3c4, alpha: 0.25 });
    this.sun.circle(0, 0, 44).fill({ color: 0xfff1b0, alpha: 0.6 });
    this.sun.circle(0, 0, 30).fill(0xfff6d6);
    this.sun.position.set(w * 0.82, h * 0.16);
  }

  update(dt: number, scrollFrac: number) {
    this.t += dt;
    for (const c of this.clouds) {
      c.g.x += c.speed * dt;
      if (c.g.x > this.w + 120) c.g.x = -120;
      c.g.y = this.h * c.y + scrollFrac * 40;
    }
    this.sun.scale.set(1 + Math.sin(this.t * 0.8) * 0.02);
  }
}

/**
 * Painted city backdrop (from the asset pack) behind the ground floor, a
 * cobblestone street and street furniture. Very wide so desktop screens see a
 * full panorama; tiles are mirrored alternately to hide the seams.
 */
export class Landscape extends Container {
  readonly back = new Container();
  readonly front = new Container();

  layout(groundY: number) {
    this.back.removeChildren();
    this.front.removeChildren();
    const span = 2600;
    const left = L.towerW / 2 - span / 2;
    const base = groundY + L.groundH; // sidewalk top

    // city band: rows 48 % … 86 % of the painting (roofs, trees, fence)
    const key = 'hintergruende/stadt_und_strasse';
    const t = tex(key);
    const y0 = Math.round(t.height * 0.48);
    const y1 = Math.round(t.height * 0.86);
    const tileW = 430;
    const k = tileW / t.width;
    const band = subTex(key, 0, y0, t.width, y1 - y0);
    for (let i = 0; i * tileW < span; i++) {
      const s = new Sprite(band);
      s.anchor.set(0, 1);
      s.scale.set(i % 2 ? -k : k, k);
      s.position.set(left + i * tileW + (i % 2 ? tileW : 0), base + 2);
      this.back.addChild(s);
    }
    // cobblestones from the bottom of the painting
    const cob = subTex(key, 0, y1, t.width, t.height - y1);
    const ck = 300 / t.width;
    const road = new Container();
    for (let i = 0; i * 300 < span; i++) {
      for (let row = 0; row < 3; row++) {
        const s = new Sprite(cob);
        s.scale.set(i % 2 ? -ck : ck, ck);
        s.position.set(left + i * 300 + (i % 2 ? 300 : 0), base + row * (t.height - y1) * ck - 2);
        s.tint = row === 0 ? 0xffffff : 0xb9a99a;
        road.addChild(s);
      }
    }
    const curb = new Graphics();
    // pavement below the road so tall (desktop) viewports never show sky under the street
    const under = new Graphics();
    under.rect(left, base + L.streetH - 2, span, 1400).fill(0x4a3a30);
    under.rect(left, base + L.streetH - 2, span, 10).fill(0x6b5646);
    for (let x = left; x < left + span; x += 46) under.rect(x, base + L.streetH + 8, 2, 1400).fill({ color: 0x2a1c16, alpha: 0.25 });
    curb.rect(left, base + 20, span, 4).fill({ color: 0x3a2a22, alpha: 0.55 });
    curb.rect(left, base + L.streetH - 4, span, 4).fill({ color: 0x2a1c16, alpha: 0.6 });
    this.front.addChild(under, road, curb);
    for (let i = 0; i < 26; i++) {
      const lx = left + 70 + i * 104;
      if (lx > -50 && lx < L.towerW + 30) continue;
      const m = new Sprite(tex('gebaeude/strassenmobiliar'));
      m.anchor.set(0.5, 1);
      const mk = 78 / m.texture.height;
      m.scale.set(i % 2 ? -mk : mk, mk);
      m.position.set(lx, base + 6);
      this.back.addChild(m);
    }
  }
}
