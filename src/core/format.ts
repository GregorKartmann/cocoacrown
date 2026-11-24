import { Decimal, D, type DecimalLike } from './num';

export type Notation = 'short' | 'scientific';

/** German short-scale abbreviations up to 1e21, afterwards two-letter idle notation (aa, ab, …). */
const GERMAN_SUFFIXES = ['', 'Tsd.', 'Mio.', 'Mrd.', 'Bio.', 'Brd.', 'Trio.', 'Trd.'];
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function letterSuffix(groupIndex: number): string {
  // groupIndex 8 -> "aa", 9 -> "ab", … 33 -> "az", 34 -> "ba"
  const n = groupIndex - GERMAN_SUFFIXES.length;
  const first = Math.floor(n / 26);
  const second = n % 26;
  if (first < 26) return ALPHABET[first] + ALPHABET[second];
  // Beyond "zz" (≈1e723): fall back to three letters.
  const a = Math.floor(first / 26) - 1;
  return ALPHABET[Math.max(0, a) % 26] + ALPHABET[first % 26] + ALPHABET[second];
}

function trimZeros(s: string): string {
  if (!s.includes(',')) return s;
  return s.replace(/0+$/, '').replace(/,$/, '');
}

function formatSmall(x: number, decimals: number): string {
  const fixed = x.toFixed(decimals).replace('.', ',');
  return trimZeros(fixed);
}

function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formats numbers the way German players expect: decimal comma, thousands dot,
 * three significant digits with abbreviations for large values.
 */
export function formatNumber(value: DecimalLike, notation: Notation = 'short', smallDecimals = 1): string {
  const d = D(value);
  if (d.lt(0)) return '−' + formatNumber(d.neg(), notation, smallDecimals);
  if (d.eq(0)) return '0';
  const e = d.exponent;
  if (e < 3) {
    const x = d.toNumber();
    if (x < 0.01) return '0';
    const dec = x < 10 ? Math.max(smallDecimals, 0) : x < 100 ? Math.min(smallDecimals, 1) : 0;
    return formatSmall(x, dec);
  }
  if (e < 6 && notation === 'short') {
    // 1.000 – 999.999 shown in full with thousands separator.
    return groupThousands(Math.floor(d.toNumber()).toString());
  }
  if (notation === 'scientific') {
    const m = d.mantissa;
    let mant = m.toFixed(2);
    let exp = e;
    if (mant === '10.00') {
      mant = '1.00';
      exp += 1;
    }
    return `${mant.replace('.', ',')}e${exp}`;
  }
  const group = Math.floor(e / 3);
  const scaled = d.mantissa * Math.pow(10, e - group * 3); // 1 … 999.99
  let digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  let shown = Number(scaled.toFixed(digits));
  let g = group;
  if (shown >= 1000) {
    shown = shown / 1000;
    g += 1;
    digits = 2;
  }
  const suffix = g < GERMAN_SUFFIXES.length ? GERMAN_SUFFIXES[g] : letterSuffix(g);
  return `${trimZeros(shown.toFixed(digits).replace('.', ','))} ${suffix}`;
}

export function formatMoney(value: DecimalLike, notation: Notation = 'short'): string {
  return `${formatNumber(value, notation, 0)} €`;
}

export function formatRate(value: DecimalLike, notation: Notation = 'short'): string {
  return `${formatNumber(value, notation, 1)} €/s`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m} min ${rs} s` : `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} h ${rm} min` : `${h} h`;
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits).replace('.', ',')} %`;
}

export function formatMultiplier(x: number): string {
  const s = Number.isInteger(x) ? x.toString() : x.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `×${s.replace('.', ',')}`;
}

export function isDecimal(v: unknown): v is Decimal {
  return v instanceof Decimal;
}
