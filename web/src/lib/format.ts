/** Station and site are in Kenya; render every clock time in that zone. */
export const NAIROBI = 'Africa/Nairobi';

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: NAIROBI,
  });

export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: NAIROBI,
  });

export const DAY_MINUTES = 24 * 60;

/**
 * Minutes since the start of the local day the series begins in.
 *
 * Station timestamps are UTC while the axis is East Africa Time (UTC+3), so a
 * UTC-midnight day maps onto two local dates. Measuring from the first
 * reading's local date keeps the axis monotonic instead of wrapping at
 * midnight and collapsing the day into a sliver.
 */
export function makeDayAxis(firstIso: string) {
  const start = new Date(firstIso);
  // Local calendar date of the first reading, as a UTC-anchored epoch.
  const localDate = start.toLocaleDateString('en-CA', { timeZone: NAIROBI });
  const [y, mo, d] = localDate.split('-').map(Number);
  // EAT is UTC+3 year-round (no daylight saving), so local midnight is 21:00Z.
  const originMs = Date.UTC(y, mo - 1, d, 0, 0, 0) - 3 * 3600_000;

  return (iso: string) => (new Date(iso).getTime() - originMs) / 60_000;
}

/**
 * "about 3 hours ago", "yesterday", "4 days ago".
 *
 * Deliberately vague, and deliberately never "just now": the whole purpose of
 * this string is to make a reader discount a number, so it rounds away from
 * freshness rather than toward it. A precise second count would imply live
 * data, which is the opposite of what it is there to say.
 *
 * `nowMs` is injectable so the output is deterministic under test.
 */
export function relativeAge(fromIso: string, nowMs: number = Date.now()): string {
  const minutes = Math.floor((nowMs - new Date(fromIso).getTime()) / 60_000);
  if (minutes < 0) return 'just recorded';
  if (minutes < 5) return 'moments ago';
  if (minutes < 60) return `about ${Math.floor(minutes / 5) * 5} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'about an hour ago';
  if (hours < 24) return `about ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
