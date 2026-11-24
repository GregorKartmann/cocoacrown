import Decimal from 'break_infinity.js';

/**
 * Thin helpers around break_infinity.js.
 * All economic quantities (money, goods value, capacities) are Decimals so the
 * game can grow far beyond Number.MAX_SAFE_INTEGER and even beyond 1e308.
 */
export { Decimal };
export type DecimalLike = Decimal | number | string;

export const D = (v: DecimalLike): Decimal => (v instanceof Decimal ? v : new Decimal(v));
export const zero = (): Decimal => new Decimal(0);

export const dmin = (a: Decimal, b: Decimal): Decimal => (a.lt(b) ? a : b);
export const dmax = (a: Decimal, b: Decimal): Decimal => (a.gt(b) ? a : b);

/** Serialise for save files. Strings survive JSON round trips without precision loss. */
export const ser = (d: Decimal): string => d.toString();
export const deser = (s: unknown): Decimal => {
  if (typeof s === 'number' && Number.isFinite(s)) return new Decimal(s);
  if (typeof s === 'string') {
    const d = new Decimal(s);
    if (Number.isFinite(d.mantissa) && Number.isFinite(d.exponent)) return d;
  }
  throw new Error(`Ungültige Zahl im Spielstand: ${String(s)}`);
};

/** Relative closeness check used by tests and invariants. */
export function approxEqual(a: Decimal, b: Decimal, relTol = 1e-9): boolean {
  if (a.eq(b)) return true;
  const diff = a.sub(b).abs();
  const scale = dmax(a.abs(), b.abs());
  if (scale.eq(0)) return diff.eq(0);
  return diff.div(scale).lte(relTol);
}

/** Ratio a/b as a plain number (clamped), used for visuals and UI bars only. */
export function ratio(a: Decimal, b: Decimal): number {
  if (b.lte(0)) return 0;
  const r = a.div(b).toNumber();
  if (!Number.isFinite(r)) return 0;
  return r;
}
