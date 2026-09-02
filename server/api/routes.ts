import { Router } from 'express';
import path from 'node:path';
import { createConduitSource } from '../ingest/ConduitSource.js';
import type { Reading } from '../ingest/types.js';
import { OpenMeteoClient, rainLookaheadSet, SITE } from '../forecast/openMeteo.js';
import { loadCoefficients, calibrate } from '../calibration/apply.js';
import { buildDecisions } from '../decisions/instructions.js';
import { assessSpray, deltaT, SPRAY } from '../indices/spray.js';
import { assessDrying } from '../indices/drying.js';
import { assessHeat, assessThi } from '../indices/heat.js';

/**
 * Timeline point for the UI: one row per observation with each index resolved,
 * so the client renders bands without recomputing any thresholds.
 */
function timeline(readings: Reading[], rainAt: (ts: string) => boolean) {
  return readings.map((r) => {
    const spray = assessSpray(r, rainAt(r.ts));
    const drying = assessDrying(r, rainAt(r.ts));
    const heat = assessHeat(r);
    return {
      ts: r.ts,
      tempC: r.tempC,
      humidityPct: r.humidityPct,
      windSpeedMs: r.windSpeedMs,
      deltaT: Number(deltaT(r).toFixed(2)),
      wbgtC: heat.wbgtC,
      thi: assessThi(r).thi,
      spray: { pass: spray.pass, failures: spray.failures, reason: spray.reason },
      drying: { pass: drying.pass, reason: drying.reason },
      heatBand: heat.band,
    };
  });
}


/**
 * Minutes since local midnight of the day the series starts in.
 *
 * East Africa Time is UTC+3 with no daylight saving, so local midnight is
 * 21:00Z of the previous date. Measuring elapsed minutes keeps the day
 * monotonic across the midnight wrap.
 */
function elapsedMinutesFrom(firstIso: string): (iso: string) => number {
  const localDate = new Date(firstIso).toLocaleDateString('en-CA', {
    timeZone: 'Africa/Nairobi',
  });
  const [y, m, d] = localDate.split('-').map(Number);
  const originMs = Date.UTC(y, m - 1, d) - 3 * 3600_000;
  return (iso: string) => (new Date(iso).getTime() - originMs) / 60_000;
}

export function createRouter(root: string): Router {
  const router = Router();
  const source = createConduitSource(root);
  const meteo = new OpenMeteoClient(path.join(root, 'data', 'cache'));

  /**
   * Rain lookahead from the forecast, keyed by local hour.
   * Falls back to "no rain known" if the network is down — with the caveat
   * reported to the client rather than hidden.
   */
  async function rainLookahead(): Promise<{ set: Set<string>; degraded: boolean }> {
    try {
      const f = await meteo.forecast(2);
      return { set: rainLookaheadSet(f, SPRAY.rainLookaheadHours), degraded: false };
    } catch {
      return { set: new Set<string>(), degraded: true };
    }
  }

  /**
   * Everything the dashboard needs, in one call.
   *
   * `?at=HH:MM` (East Africa Time) evaluates the day as at that moment. The
   * bundled sample is a fixed historical day whose final row lands at 02:55
   * local, so the demo pins a working-hours moment rather than opening on a
   * dead midnight reading. A live feed needs no pin and uses the newest row.
   */
  router.get('/api/today', async (req, res) => {
    try {
      const latest = await source.getLatest();
      if (!latest) {
        return res.status(503).json({
          error: 'No station observations available.',
          hint: 'Check data/weatherdata_september.csv, or set CONDUIT_API_KEY and CONDUIT_EMAIL.',
        });
      }

      // Day-of-latest-reading, so the CSV sample and a live feed behave alike.
      const day = latest.ts.slice(0, 10);
      const readings = await source.getHistory(
        new Date(`${day}T00:00:00Z`),
        new Date(`${day}T23:59:59Z`),
      );

      const { set: rainSet, degraded } = await rainLookahead();
      const rainAt = (ts: string) => rainSet.has(ts.slice(0, 13));

      // Optionally evaluate "now" at an earlier point in the day.
      // Compare on elapsed minutes from the series start, not on a clock
      // string: timestamps are UTC and the axis is UTC+3, so the local day
      // wraps past midnight and "02:55" sorts before "13:00" while actually
      // being twelve hours later.
      const at = typeof req.query.at === 'string' ? req.query.at : undefined;
      let upTo = readings;
      const pin = at?.match(/^(\d{2}):(\d{2})$/);
      if (pin && readings.length) {
        const elapsed = elapsedMinutesFrom(readings[0].ts);
        const cutoff = Number(pin[1]) * 60 + Number(pin[2]);
        const sliced = readings.filter((r) => elapsed(r.ts) <= cutoff);
        if (sliced.length) upTo = sliced;
      }

      const decisions = buildDecisions(readings, rainSet, upTo);
      const coeffs = await loadCoefficients(root);

      res.json({
        source: source.name,
        site: SITE,
        latest: upTo[upTo.length - 1] ?? latest,
        decisions,
        timeline: timeline(readings, rainAt),
        calibration: coeffs,
        forecastDegraded: degraded,
      });
    } catch (err) {
      res.status(502).json({
        error: 'Could not build today\'s decisions.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * Bias-corrected forecast for the hours ahead, with provenance on every
   * value so the UI can show what was corrected and by how much.
   */
  router.get('/api/forecast', async (_req, res) => {
    try {
      const [f, coeffs] = await Promise.all([meteo.forecast(2), loadCoefficients(root)]);
      const rainSet = rainLookaheadSet(f, SPRAY.rainLookaheadHours);

      const hours = f.time.map((t, i) => {
        // Local timestamps; convert to UTC hour to match the fitted offsets.
        const utcHour = new Date(`${t}:00+03:00`).getUTCHours();
        return {
          time: t,
          temperature: calibrate(coeffs, 'tempC', f.temperature_2m[i], utcHour),
          humidity: calibrate(coeffs, 'humidityPct', f.relative_humidity_2m[i], utcHour),
          windSpeed: calibrate(coeffs, 'windSpeedMs', f.wind_speed_10m[i], utcHour),
          precipitation: { value: f.precipitation[i], provenance: 'raw_forecast' as const },
          rainWithin6h: rainSet.has(t.slice(0, 13)),
        };
      });

      res.json({ site: SITE, hours, calibration: coeffs });
    } catch (err) {
      res.status(502).json({
        error: 'Forecast service unavailable.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.get('/api/health', (_req, res) => {
    res.json({ ok: true, source: source.name });
  });

  return router;
}
