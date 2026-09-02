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

/** Minutes past local midnight — the x-axis for the day timeline. */
export function minutesOfDay(iso: string): number {
  const [h, m] = hhmm(iso).split(':').map(Number);
  return h * 60 + m;
}

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
