/**
 * Save migrations. Each entry upgrades plain save data from version N to N+1.
 * Rules: never delete player progress, give new fields safe defaults, keep
 * migrations pure so they can be unit-tested with old fixtures.
 *
 * Version history
 *   1 – first public vertical slice (Manufaktur, 5 Etagen)
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  // 1: (d) => ({ ...d, research: { points: '0', nodes: [] } }),  // example for v2
};

export function migrate(
  data: Record<string, unknown>,
  from: number,
  to: number,
  migrations: Record<number, Migration> = MIGRATIONS,
): Record<string, unknown> {
  let d = data;
  for (let v = from; v < to; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`Keine Migration von Version ${v} auf ${v + 1}.`);
    d = m(d);
  }
  return d;
}
