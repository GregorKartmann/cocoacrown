/**
 * Wall clock for the season event. Normally the device clock; for testing
 * the Advent calendar `?debug&advent=YYYY-MM-DD` (optionally `THH:MM`) moves
 * it to that local date while the time keeps running.
 */
let offset = 0;

export function eventNow(): number {
  return Date.now() + offset;
}

/** Sets the event clock to a local date (debug only). Returns false if unreadable. */
export function setEventDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(text.trim());
  if (!m) return false;
  const now = new Date();
  const target = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    m[4] !== undefined ? Number(m[4]) : now.getHours(),
    m[5] !== undefined ? Number(m[5]) : now.getMinutes(),
    now.getSeconds(),
  );
  if (Number.isNaN(target.getTime())) return false;
  offset = target.getTime() - now.getTime();
  return true;
}

export function resetEventClock(): void {
  offset = 0;
}

/** Reads the debug override from the page address once at start. */
export function initEventClock(search: string): void {
  if (!/(^|[?&])debug(=|&|$)/.test(search)) return;
  const v = new URLSearchParams(search).get('advent');
  if (v) setEventDate(v);
}
