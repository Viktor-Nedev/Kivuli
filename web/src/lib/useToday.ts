import { useEffect, useState } from 'react';
import { NAIROBI } from './format';

/**
 * Today's date at the station, kept current without a reload.
 *
 * ## Why this is not just `new Date()` read once
 *
 * A dashboard is left open. A screen in an office, a phone on a windowsill, a
 * judge's browser tab during a demo — all of them cross midnight without
 * anyone touching them, and a date computed once at mount would then be
 * yesterday's while claiming to be today's. That is the specific failure this
 * exists to prevent.
 *
 * ## Why midnight in Nairobi rather than the viewer's midnight
 *
 * The station is in Kenya and every clock time in this interface is rendered
 * in East Africa Time. A reader in another zone should see the station's day
 * roll over when the station's day rolls over, not when their own does —
 * otherwise the header and the readings underneath it would disagree for
 * several hours.
 *
 * The timer is set to the next Nairobi midnight rather than to a fixed
 * interval, so the component wakes once a day instead of polling.
 */

/** `YYYY-MM-DD` at the station, for the instant given (default: now). */
export function stationDate(at: Date = new Date()): string {
  // `en-CA` formats as YYYY-MM-DD, which sorts and compares correctly.
  return at.toLocaleDateString('en-CA', { timeZone: NAIROBI });
}

/** Milliseconds until the next midnight at the station. */
function msUntilStationMidnight(now: Date = new Date()): number {
  const todayAtStation = stationDate(now);
  // East Africa Time is UTC+3 year-round with no daylight saving, so local
  // midnight is 21:00Z the previous day. Stated as arithmetic rather than
  // guessed from the viewer's offset, which may be anything.
  const [y, m, d] = todayAtStation.split('-').map(Number);
  const nextMidnightUtc = Date.UTC(y, m - 1, d + 1) - 3 * 3600_000;
  // Never return zero or negative: a timer of 0 would spin.
  return Math.max(nextMidnightUtc - now.getTime(), 1000);
}

/**
 * The station's current date as `YYYY-MM-DD`, re-rendering when it changes.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => stationDate());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(() => {
        setToday(stationDate());
        schedule();
      }, msUntilStationMidnight());
    };
    schedule();

    // A laptop that sleeps through midnight never fires the timer, and a
    // machine whose clock is corrected mid-session would otherwise keep the
    // stale date until the next midnight. Both are caught on wake.
    const recheck = () => setToday(stationDate());
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, []);

  return today;
}
