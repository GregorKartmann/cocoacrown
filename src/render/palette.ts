/** Cocoa Crown art palette – warm "candy industrial" cartoon style. */
export const C = {
  ink: 0x3b2417,
  inkSoft: 0x5c3a28,
  cocoaDark: 0x4a2b1b,
  cocoa: 0x6e4129,
  milk: 0xa36a42,
  caramel: 0xd9984f,
  cream: 0xfbf0dc,
  cream2: 0xf1dfc2,
  cream3: 0xe4cba5,
  mint: 0x5cc7b2,
  mintDark: 0x2f9884,
  mintLight: 0xa9e6d8,
  gold: 0xf5c542,
  goldDark: 0xc98d17,
  goldLight: 0xffe58a,
  red: 0xe5574b,
  redDark: 0xb83a31,
  pink: 0xf29bb0,
  rose: 0xf6c9cf,
  berry: 0xb24a6e,
  sky: 0x9fd7f2,
  skyTop: 0x7cc3ea,
  skyBottom: 0xffe4c4,
  steel: 0xa3afbd,
  steelLight: 0xd5dde6,
  steelDark: 0x66727f,
  white: 0xffffff,
  black: 0x000000,
  green: 0x6cc24a,
  greenDark: 0x3f8f2b,
  wood: 0xb57a48,
  woodDark: 0x87542e,
  woodLight: 0xd29a62,
  brick: 0xc8694a,
  brickDark: 0x9c4b33,
  glass: 0xcfeefd,
  hill: 0x9fd18a,
  hillDark: 0x7dbb6b,
  city: 0xbfa6c9,
  road: 0x5d5a66,
  roadLight: 0x7a7784,
};

/** Per-floor theme: wall, accent and product colour. */
export const FLOOR_THEMES = [
  { wall: 0xf4dcbc, wallStripe: 0xeccfa9, accent: 0xd9984f, product: 0x8a5232, label: 0xf5c542, shirt: 0xe07a3f },
  { wall: 0xe6d9f2, wallStripe: 0xd9c9ea, accent: 0x9c7fd0, product: 0x6b3d24, label: 0xc8b2ef, shirt: 0x8b6cc6 },
  { wall: 0xd7eddf, wallStripe: 0xc6e3d1, accent: 0x5cc7b2, product: 0x5a3220, label: 0x8fe0c8, shirt: 0x3fa88f },
  { wall: 0xf7d9dd, wallStripe: 0xefc6cd, accent: 0xe07a9a, product: 0x4a2617, label: 0xf6b0c3, shirt: 0xd05d82 },
  { wall: 0xf6e9bf, wallStripe: 0xeedba0, accent: 0xd8a52a, product: 0x3f1f12, label: 0xffe08a, shirt: 0x2f2f45 },
];

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export const darken = (c: number, t: number) => mix(c, 0x000000, t);
export const lighten = (c: number, t: number) => mix(c, 0xffffff, t);

export const SKIN = [0xf6d2b4, 0xe9b58f, 0xc98d64, 0x9a6440, 0x6b4128];
export const HAIR = [0x2b1a10, 0x6b3a1e, 0xc98a3a, 0xe8c56a, 0x9b9b9b, 0xb2442f];
export const RARITY_COLORS = [0xb7b0a6, 0x4aa8e8, 0xa66ee0, 0xf5b324];

/** Colours sampled from the painted asset pack (enamel, brass, ivory, espresso). */
export const P = {
  espresso: 0x2a1712,
  espressoLight: 0x4a2c20,
  ivory: 0xf7ecd6,
  ivory2: 0xe9d6b2,
  brass: 0xc8963e,
  brassLight: 0xf0cf7a,
  brassDark: 0x8a5f22,
  burgundy: 0x7d1f2c,
  burgundyLight: 0xa83443,
  burgundyDark: 0x4f1119,
  petrol: 0x1d5550,
  petrolLight: 0x2f8076,
  caramel: 0xd9984f,
  ember: 0xffa64a,
};
