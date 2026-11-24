import { describe, expect, it } from 'vitest';
import { formatDuration, formatMoney, formatNumber } from '../src/core/format';
import { D } from '../src/core/num';

describe('Zahlenformatierung', () => {
  it('kleine Zahlen mit Dezimalkomma', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(3.25, 'short', 2)).toBe('3,25');
    expect(formatNumber(12.5)).toBe('12,5');
    expect(formatNumber(999)).toBe('999');
  });
  it('Tausender mit Punkt bis 999.999', () => {
    expect(formatNumber(1000)).toBe('1.000');
    expect(formatNumber(123456)).toBe('123.456');
  });
  it('deutsche Kurzformen', () => {
    expect(formatNumber(1_230_000)).toBe('1,23 Mio.');
    expect(formatNumber(45_600_000_000)).toBe('45,6 Mrd.');
    expect(formatNumber(D('7.89e12'))).toBe('7,89 Bio.');
    expect(formatNumber(D('1e15'))).toBe('1 Brd.');
    expect(formatNumber(D('2.5e21'))).toBe('2,5 Trd.');
  });
  it('Buchstaben-Notation jenseits von Trilliarden', () => {
    expect(formatNumber(D('1e24'))).toBe('1 aa');
    expect(formatNumber(D('3.3e27'))).toBe('3,3 ab');
    expect(formatNumber(D('1e102'))).toMatch(/^1 [a-z]{2}$/);
  });
  it('Zahlen jenseits von 1e308 bleiben darstellbar', () => {
    expect(formatNumber(D('1.5e500'))).toMatch(/^150 [a-z]{2}$/);
    expect(formatNumber(D('1.5e500'), 'scientific')).toBe('1,50e500');
  });
  it('Rundung an der Grenze springt korrekt in die nächste Stufe', () => {
    expect(formatNumber(999_999_999)).toBe('1 Mrd.');
  });
  it('Geld und Dauer', () => {
    expect(formatMoney(1500)).toBe('1.500 €');
    expect(formatDuration(59)).toBe('59 s');
    expect(formatDuration(3720)).toBe('1 h 2 min');
  });
});
