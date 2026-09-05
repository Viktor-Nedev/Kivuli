import { Router } from 'express';
import path from 'node:path';
import { createConduitSource } from '../ingest/ConduitSource.js';
import type { Reading } from '../ingest/types.js';
import { OpenMeteoClient, rainLookaheadSet, SITE, type Site } from '../forecast/openMeteo.js';
import { loadCoefficients, calibrate } from '../calibration/apply.js';
import { buildDecisions } from '../decisions/instructions.js';
import { assessSpray, deltaT, SPRAY } from '../indices/spray.js';
import { assessDrying } from '../indices/drying.js';
import { assessHeat, assessThi } from '../indices/heat.js';
import { loadClimate, todayInNairobi } from '../climate/history.js';
import { buildOutlook } from '../forecast/outlook.js';
import { buildRainOutlook } from '../climate/rainOutlook.js';
import type { DailyRain } from '../climate/rainfall.js';

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
export function elapsedMinutesFrom(firstIso: string): (iso: string) => number {
  const localDate = new Date(firstIso).toLocaleDateString('en-CA', {
    timeZone: 'Africa/Nairobi',
  });
  const [y, m, d] = localDate.split('-').map(Number);
  const originMs = Date.UTC(y, m - 1, d) - 3 * 3600_000;
  return (iso: string) => (new Date(iso).getTime() - originMs) / 60_000;
}

/**
 * Kenya's bounding box, with a little margin.
 *
 * ERA5 is global, so an unchecked lat/lon would happily return a rainfall
 * climatology for Antarctica — dressed in a Swahili advisory, ranked against
 * MAM/OND seasons that do not exist there. Refusing out-of-region input is the
 * same posture as the rest of the app: answer what the data supports, and say
 * plainly when a question is outside it.
 */
const KENYA_BOUNDS = { minLat: -5.0, maxLat: 5.5, minLon: 33.9, maxLon: 41.9 };

/**
 * Reads `?lat=&lon=` (optionally `&place=`), defaulting to the station site.
 * Returns an error string rather than throwing so the caller can answer 400
 * with something a person can act on.
 */
export function parseSite(query: {
  lat?: unknown;
  lon?: unknown;
  place?: unknown;
}): { site: Site; place: string } | { error: string } {
  const { lat, lon } = query;
  if (lat === undefined && lon === undefined) return { site: SITE, place: 'JKUAT' };
  if (lat === undefined || lon === undefined) {
    return { error: 'Both lat and lon are required to choose a location.' };
  }

  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { error: 'lat and lon must be numbers.' };
  }
  if (
    latitude < KENYA_BOUNDS.minLat ||
    latitude > KENYA_BOUNDS.maxLat ||
    longitude < KENYA_BOUNDS.minLon ||
    longitude > KENYA_BOUNDS.maxLon
  ) {
    return {
      error:
        'That location is outside Kenya. The rainfall seasons, the Swahili advisory and the ' +
        'onset rule this page uses are specific to East Africa, so it will not answer for ' +
        'points beyond it.',
    };
  }

  const place = typeof query.place === 'string' && query.place.trim() ? query.place.trim() : 'this location';
  return { site: { latitude, longitude, timezone: SITE.timezone }, place };
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

  /**
   * Multi-year rainfall climatology.
   *
   * Deliberately its own endpoint rather than more fields on `/api/today`.
   * It reads eleven years of daily records where the decision cards need one
   * day, so folding them together would make every visitor wait on the
   * archive before learning whether they can spray this afternoon — and would
   * let an archive outage take the whole dashboard down.
   *
   * A failure degrades rather than 502s, matching how `forecastDegraded`
   * already works: the page can say "history unavailable" and still be a
   * page, which beats an error screen for something this peripheral to the
   * core decision.
   */
  router.get('/api/climate', async (req, res) => {
    const parsed = parseSite(req.query as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      // `...summary` carries its own `site` and `place`, so nothing is
      // hardcoded here — a spread after a literal would silently overwrite the
      // location actually computed.
      const summary = await loadClimate(meteo, parsed.site, parsed.place);
      res.json({ degraded: false, ...summary });
    } catch (err) {
      res.json({
        site: parsed.site,
        place: parsed.place,
        degraded: true,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * The next three days as decisions rather than numbers.
   *
   * Separate from `/api/today` for the same reason `/api/climate` is: the
   * Overview must not wait on a three-day forecast before it can tell someone
   * whether to spray this afternoon.
   *
   * Uses `forecast(3)` rather than the two days `/api/today` fetches, so this
   * route has its own cache key and cannot invalidate the warm one the
   * decision cards depend on.
   */
  router.get('/api/outlook', async (req, res) => {
    const parsed = parseSite(req.query as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const [f, coeffs] = await Promise.all([meteo.forecast(3), loadCoefficients(root)]);
      const outlook = buildOutlook(f, coeffs);

      // Rain standing needs the multi-year record. Fetched separately and
      // allowed to fail on its own: an archive outage should cost the rainfall
      // comparison, not the spray and drying windows.
      let rainOutlook = null;
      try {
        const daily = await meteo.dailyArchive('2015-01-01', todayInNairobi(), parsed.site);
        const series: DailyRain[] = daily.time.map((date, i) => ({
          date,
          mm: daily.precipitation_sum[i] ?? 0,
        }));

        // Sum the hourly horizon into local calendar days.
        const byDay = new Map<string, number>();
        for (let i = 0; i < f.time.length; i++) {
          const day = f.time[i].slice(0, 10);
          byDay.set(day, (byDay.get(day) ?? 0) + (f.precipitation?.[i] ?? 0));
        }
        const forecastDaily = [...byDay.entries()].map(([date, mm]) => ({ date, mm }));

        rainOutlook = buildRainOutlook(forecastDaily, series);
      } catch {
        // Left null; the client says the comparison is unavailable.
      }

      res.json({
        site: parsed.site,
        place: parsed.place,
        degraded: false,
        generatedAt: new Date().toISOString(),
        ...outlook,
        rainOutlook,
      });
    } catch (err) {
      res.json({
        site: parsed.site,
        place: parsed.place,
        degraded: true,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.get('/api/health', (_req, res) => {
    res.json({ ok: true, source: source.name });
  });

  /**
   * Client-safe config. Mapbox public tokens are meant to be exposed in
   * frontend code (Mapbox scopes them and expects this), so serving it from
   * the same `.env` the server already reads avoids a second env mechanism
   * just for Vite's `VITE_` prefix convention.
   */
  router.get('/api/config', (_req, res) => {
    res.json({ mapboxToken: process.env.MAPBOX_TOKEN ?? null });
  });

  return router;
}
