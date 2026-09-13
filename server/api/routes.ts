import { Router } from 'express';
import path from 'node:path';
import { createConduitSource } from '../ingest/ConduitSource.js';
import type { Reading } from '../ingest/types.js';
import { OpenMeteoClient, rainLookaheadSet, SITE, type Site } from '../forecast/openMeteo.js';
import { loadCoefficients } from '../calibration/apply.js';
import { buildDecisions } from '../decisions/instructions.js';
import { assessSpray, deltaT, SPRAY } from '../indices/spray.js';
import { assessDrying } from '../indices/drying.js';
import { assessHeat, assessThi } from '../indices/heat.js';
import { loadClimate, todayInNairobi } from '../climate/history.js';
import { buildOutlook } from '../forecast/outlook.js';
import { buildRainOutlook } from '../climate/rainOutlook.js';
import { buildWaterBalance, CROP_STAGES, DEFAULT_CROP_ID } from '../climate/waterBalance.js';
import { assessUv, peakUv } from '../indices/uv.js';
import { validateAll } from '../validation/groundTruth.js';
import { buildAgreement } from '../validation/agreement.js';
import { NasaPowerClient } from '../satellite/power.js';
import { buildSolarCrossCheck } from '../satellite/crosscheck.js';
import { buildRiverOutlook } from '../climate/rivers.js';
import { matchIntent, capabilities } from '../query/intents.js';
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
/** An ISO instant as HH:MM in Kenya. Uses the IANA zone, not hand arithmetic. */
function hhmmLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
  // Shares the cache directory; its own `solar_` key prefix keeps it from
  // touching any warm entry another route depends on.
  const power = new NasaPowerClient(path.join(root, 'data', 'cache'));

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

      // River discharge is its own failure: the flood model may be down, or
      // simply have no reach here. Neither should cost the rainfall history.
      let river = null;
      try {
        const daily = await meteo.dischargeForecast(7, parsed.site);
        river = buildRiverOutlook(daily, parsed.place);
      } catch {
        // Left null; the panel says the river outlook is unavailable.
      }

      res.json({ degraded: false, ...summary, river });
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

  /**
   * Forward crop water balance, and the UV exposure that rides along with it.
   *
   * Its own endpoint rather than more fields on `/api/outlook`: the balance is
   * daily and seven days long, the outlook is hourly and three. Merging would
   * truncate the deficit to the three-day figure and lose most of the signal.
   *
   * Takes a site, because the balance is pure model arithmetic with no station
   * calibration in it and can honestly travel — unlike the spray and drying
   * gates, which are pinned to the instrument.
   */
  router.get('/api/water', async (req, res) => {
    const parsed = parseSite(req.query as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    // An unknown crop falls back rather than erroring: a stale bookmark should
    // still answer, and the response names the crop it actually used.
    const requested = typeof req.query.crop === 'string' ? req.query.crop : DEFAULT_CROP_ID;
    const crop = CROP_STAGES.find((c) => c.id === requested) ?? CROP_STAGES[0];

    try {
      const daily = await meteo.dailyForecast(7, parsed.site);

      const forecastDaily = daily.time.map((date, i) => ({
        date,
        et0Mm: daily.et0_fao_evapotranspiration?.[i] ?? 0,
        rainMm: daily.precipitation_sum?.[i] ?? 0,
        rainProbabilityPct: daily.precipitation_probability_max?.[i] ?? null,
      }));

      const balance = buildWaterBalance(forecastDaily, crop);
      const uvDays = daily.time.map((date, i) => assessUv(date, daily.uv_index_max?.[i] ?? 0));

      res.json({
        site: parsed.site,
        place: parsed.place,
        degraded: false,
        generatedAt: new Date().toISOString(),
        crops: CROP_STAGES,
        balance,
        uv: { days: uvDays, peak: peakUv(uvDays) },
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

  /**
   * The station as ground truth: how wrong is the model here?
   *
   * The Conduit's stated purpose is that its measurements "contribute to the
   * calibration and validation of satellite observations and digital models".
   * This endpoint is that sentence made executable — the station's own hourly
   * readings scoring the gridded reanalysis for the same hours.
   *
   * It is the second endpoint that reads station data, and the only screen in
   * the app where a `measured` tag is the reference rather than the caveat.
   *
   * Deliberately takes **no lat/lon**. There is one station; a validation
   * figure for anywhere else would be a comparison against an instrument that
   * is not there. Refusing the parameter is the same posture as parseSite's
   * Kenya bounding box.
   */
  router.get('/api/validation', async (_req, res) => {
    try {
      const latest = await source.getLatest();
      if (!latest) {
        res.status(503).json({
          error: 'No station observations available.',
          hint: 'The validation page compares the station against the model, so it needs the station.',
        });
        return;
      }

      const day = latest.ts.slice(0, 10);
      const readings = await source.getHistory(
        new Date(`${day}T00:00:00Z`),
        new Date(`${day}T23:59:59Z`),
      );
      const archive = await meteo.archive(day, day);

      // The station judged against itself, alongside the model judged against
      // the station. rainLookahead swallows its own network failure and
      // returns an empty set, so a dead network costs the rain gate rather
      // than the endpoint. An empty set lets more hours pass that gate, but
      // identically for all three thermometers - which is all the agreement
      // comparison claims.
      const { set: rainSet } = await rainLookahead();
      const agreement = buildAgreement(readings, (ts) => rainSet.has(ts.slice(0, 13)));

      // And the station against an actual satellite. The Conduit's stated
      // purpose names satellite observations specifically, and until now this
      // endpoint only ever scored a model. Its own try: NASA POWER is a second
      // opinion, not a dependency, so its absence costs this panel and nothing
      // else on the page.
      let solar = null;
      try {
        const days = await power.dailySolar(SITE, day, day);
        solar = buildSolarCrossCheck(readings, days, SITE);
      } catch {
        // Left null; the panel says the satellite could not be reached.
      }

      res.json({
        station: { name: source.name, day, hours: readings.length },
        degraded: false,
        generatedAt: new Date().toISOString(),
        variables: validateAll(readings, archive),
        agreement,
        solar,
      });
    } catch (err) {
      // Degrade rather than 502, matching /api/climate: the station half is
      // still worth showing even when the archive is unreachable.
      res.json({
        degraded: true,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * Ask KIVULI — routing a question to an answer that already exists.
   *
   * Explicitly not a language model. Every reply is a figure this app already
   * computes and already tags with its provenance; this only works out which
   * one was meant, and names the endpoint it came from so the answer stays
   * traceable. An unmatched question returns the capability list rather than a
   * guess.
   */
  router.get('/api/ask', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const match = matchIntent(q);

    if (!match) {
      res.json({
        understood: false,
        question: q,
        answer: 'I could not tell what that was asking. Here is what I can answer.',
        answerSw: 'Sikuelewa swali hilo. Haya ndiyo ninayoweza kujibu.',
        capabilities: capabilities(),
      });
      return;
    }

    try {
      const answer = await answerIntent(match.intent.id);
      res.json({
        understood: true,
        question: q,
        intent: match.intent.id,
        matched: match.matched,
        source: match.intent.source,
        ...answer,
      });
    } catch (err) {
      res.json({
        understood: true,
        intent: match.intent.id,
        source: match.intent.source,
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

  /**
   * Resolves one intent by calling the same builders the pages use, so an
   * answer here and the answer on the page can never disagree.
   */
  async function answerIntent(id: string): Promise<{ answer: string; answerSw: string }> {
    // The two station branches come first because they are the only ones that
    // quote an instrument rather than a model. Both reuse the same functions
    // the pages use, so the Ask box and the page cannot drift apart.
    if (id === 'station') {
      const latest = await source.getLatest();
      if (!latest) {
        return {
          answer: 'The station is not reporting, so there is no reading to give.',
          answerSw: 'Kituo hakitumi taarifa, hakuna kipimo cha kutoa.',
        };
      }
      const dt = (latest.tempC - latest.wetBulbC).toFixed(1);
      const clock = hhmmLocal(latest.ts);
      return {
        answer:
          `At ${clock} the station measured ${latest.tempC.toFixed(1)} °C, ` +
          `${latest.humidityPct.toFixed(0)}% humidity and ${latest.windSpeedMs.toFixed(1)} m/s ` +
          `wind, giving a Delta-T of ${dt} °C. Measured, not forecast.`,
        answerSw:
          `Saa ${clock} kituo kilipima ${latest.tempC.toFixed(1)} °C, ` +
          `unyevu ${latest.humidityPct.toFixed(0)}% na upepo ${latest.windSpeedMs.toFixed(1)} m/s.`,
      };
    }

    if (id === 'sensors') {
      const latest = await source.getLatest();
      if (!latest) {
        return {
          answer: 'The station is not reporting, so its accuracy cannot be checked right now.',
          answerSw: 'Kituo hakitumi taarifa, hatuwezi kupima usahihi sasa.',
        };
      }
      const day = latest.ts.slice(0, 10);
      const readings = await source.getHistory(
        new Date(`${day}T00:00:00Z`),
        new Date(`${day}T23:59:59Z`),
      );
      const { set: rainSet } = await rainLookahead();
      const a = buildAgreement(readings, (ts) => rainSet.has(ts.slice(0, 13)));
      if (!a) {
        return {
          answer: 'This station is not reporting all three thermometers, so there is nothing to compare.',
          answerSw: 'Kituo hakitumi vipimo vitatu vya joto, hakuna cha kulinganisha.',
        };
      }
      const rb = a.robustness;
      return {
        answer:
          `The station carries three thermometers and they disagree by ` +
          `${a.meanSpreadC.toFixed(3)} °C on average across ${a.n} readings — that is the ` +
          `station measuring its own uncertainty. It changes the spray verdict on ` +
          `${rb.verdictFlips} of ${rb.evaluated} readings, though on ${rb.deltaTFlips} the ` +
          `temperature gate alone disagrees.`,
        answerSw:
          `Kituo kina vipimo vitatu vya joto vinavyotofautiana kwa ` +
          `${a.meanSpreadC.toFixed(3)} °C kwa wastani. Huu ndio usahihi wa kituo chenyewe.`,
      };
    }

    if (id === 'irrigate') {
      const daily = await meteo.dailyForecast(7);
      const balance = buildWaterBalance(
        daily.time.map((date, i) => ({
          date,
          et0Mm: daily.et0_fao_evapotranspiration?.[i] ?? 0,
          rainMm: daily.precipitation_sum?.[i] ?? 0,
        })),
        CROP_STAGES[0],
      );
      return { answer: `${balance.headline}. ${balance.detail}`, answerSw: balance.headlineSw };
    }

    if (id === 'uv') {
      const daily = await meteo.dailyForecast(7);
      const peak = peakUv(daily.time.map((d, i) => assessUv(d, daily.uv_index_max?.[i] ?? 0)));
      return peak
        ? {
            answer: `Peak UV index ${peak.uvIndexMax} — ${peak.instruction}.`,
            answerSw: peak.instructionSw,
          }
        : { answer: 'No UV forecast available.', answerSw: 'Hakuna utabiri wa UV.' };
    }

    if (id === 'drought') {
      const summary = await loadClimate(meteo);
      // The advisory already phrases the multi-window comparison honestly, so
      // the answer here is the same sentence the Season page shows.
      return { answer: summary.advisory.en, answerSw: summary.advisory.sw };
    }

    // spray, drying, rain and heat all come from the forward outlook.
    const [f, coeffs] = await Promise.all([meteo.forecast(3), loadCoefficients(root)]);
    const outlook = buildOutlook(f, coeffs);

    if (id === 'heat') {
      const h = outlook.heat;
      return {
        answer: h.anyRestriction
          ? `Peak projected WBGT ${h.peakWbgtC} °C crosses the ${h.thresholdC} °C threshold — take work/rest breaks.`
          : `Peak projected WBGT ${h.peakWbgtC} °C stays under the ${h.thresholdC} °C threshold, so no work/rest restriction applies.`,
        answerSw: h.anyRestriction
          ? `Joto linafika ${h.peakWbgtC} °C — pumzika mara kwa mara.`
          : `Joto halifiki kiwango cha hatari (${h.thresholdC} °C).`,
      };
    }

    if (id === 'rain') {
      const wet = outlook.hours.filter((x) => x.precipMm > 0.1);
      return wet.length
        ? {
            answer: `Rain is forecast in ${wet.length} of the next ${outlook.horizonHours} hours, first around ${wet[0].time.slice(11, 16)} on ${wet[0].time.slice(0, 10)}.`,
            answerSw: `Mvua inatarajiwa katika saa ${wet.length} kati ya ${outlook.horizonHours} zijazo.`,
          }
        : {
            answer: `No rain is forecast in the next ${outlook.horizonHours} hours.`,
            answerSw: `Hakuna mvua inayotarajiwa katika saa ${outlook.horizonHours} zijazo.`,
          };
    }

    const band = id === 'spray' ? 'spray' : 'drying';
    const windows = outlook.windows.filter((w) => w.band === band);
    const label = band === 'spray' ? 'spray' : 'drying';
    return windows.length
      ? {
          answer: `Yes — ${windows.length} ${label} window${windows.length > 1 ? 's' : ''} in the next three days, the first ${windows[0].start.slice(11, 16)}–${windows[0].end.slice(11, 16)} on ${windows[0].start.slice(0, 10)}.`,
          answerSw: `Ndiyo — vipindi ${windows.length} katika siku tatu zijazo.`,
        }
      : {
          answer: `No ${label} window in the next three days. ${outlook.nightHoursExcluded} night hours passed the numbers but fall outside working hours.`,
          answerSw: `Hakuna kipindi cha ${label === 'spray' ? 'kunyunyiza' : 'kuanika'} katika siku tatu zijazo.`,
        };
  }

  return router;
}
