import type { HourlyForecast } from './openMeteo.js';
import type { Coefficients } from '../calibration/apply.js';
import { calibrate } from '../calibration/apply.js';
import type { Provenance, Reading } from '../ingest/types.js';
import { assessSpray, deltaT } from '../indices/spray.js';
import { assessDrying } from '../indices/drying.js';
import { wbgtShade } from '../indices/heat.js';

/**
 * The next three days as field decisions rather than numbers.
 *
 * The station answers "can I spray right now"; this answers "when can I spray
 * between now and Sunday". Same gates, same thresholds — the only difference is
 * that the inputs are a bias-corrected forecast instead of an instrument, and
 * every value carries a provenance tag that says so.
 *
 * ## Two things this module exists to get right
 *
 * **1. Night hours are excluded, and the exclusion is reported.**
 * Measured against a live 72-hour forecast at JKUAT: 29 hours pass the spray
 * Delta-T and wind bands, but only 9 fall between 06:00 and 18:00. The other 20
 * pass because night air is cool and humid — physically in-band and completely
 * useless as advice. `assessSpray` never needed a daylight gate because it only
 * ever saw a daylight-dominated station sample; projected forward without one,
 * this module would confidently recommend spraying at 02:00. The excluded count
 * is returned rather than silently dropped, because "9 usable hours" and "29
 * hours" are very different claims about opportunity.
 *
 * **2. Nothing here is ever tagged `measured`.**
 * Forward temperature, humidity and wind are `bias_corrected` when the
 * calibration coefficients are present and `raw_forecast` otherwise.
 * Precipitation and radiation have no fitted coefficients, so they are always
 * `raw_forecast`. A test pins this: the moment a forecast value could be
 * mistaken for an instrument reading, the project's whole posture is gone.
 */

/**
 * Daylight bounds for field work, local time (East Africa, UTC+3, no DST).
 *
 * Deliberately conservative rather than astronomical: sunrise and sunset at
 * this latitude sit near 06:30 and 18:40 year-round, and advice at the very
 * edges of daylight is not actionable anyway.
 */
export const FIELD_HOURS = { first: 6, last: 18 } as const;

/**
 * Solar irradiance floor for grain drying, W/m².
 *
 * Note the asymmetry with the station path, which is real and stated in the
 * README: `DRYING.visCountsMin` is 300 *SI1145 visible counts*, a
 * sensor-specific cutoff its own comment declines to call a physical
 * irradiance. This threshold is in W/m², a physical unit, because the forecast
 * supplies one. The two gates therefore answer the same question with
 * different instruments and are not interchangeable.
 */
export const DRYING_RADIATION_MIN_WM2 = 200;

/** ISO 7243 first-action threshold, °C WBGT. Shared with `indices/heat.ts`. */
const HEAT_FIRST_ACTION_WBGT = 28;

/**
 * Satisfies `assessDrying`'s station-sensor light gate so its humidity verdict
 * is the part that reaches the forward path. Not a claim about irradiance —
 * the forward light test is `DRYING_RADIATION_MIN_WM2`, applied separately.
 */
const DAYLIGHT_PROXY_COUNTS = 1000;

export type OutlookBand = 'spray' | 'drying';

export interface OutlookHour {
  /** `YYYY-MM-DDTHH:MM`, local (Africa/Nairobi). */
  time: string;
  /** Within FIELD_HOURS. Both bands are forced to fail outside it. */
  daylight: boolean;
  tempC: number;
  humidityPct: number;
  windSpeedMs: number;
  radiationWm2: number;
  precipMm: number;
  /** Dry bulb minus the *approximated* wet bulb — see `wetBulbStull`. */
  deltaTC: number;
  projectedWbgtC: number;
  spray: { pass: boolean; reason: string };
  drying: { pass: boolean; reason: string };
  /** Never `measured`. */
  provenance: Provenance;
}

export interface OutlookWindow {
  band: OutlookBand;
  start: string;
  end: string;
  hours: number;
}

export interface Outlook {
  hours: OutlookHour[];
  windows: OutlookWindow[];
  /**
   * Hours that passed the physics but were rejected only for falling outside
   * FIELD_HOURS. Surfaced so the UI can say so: most of them, most of the
   * time.
   */
  nightHoursExcluded: number;
  horizonHours: number;
  /** Highest projected WBGT across the horizon, and whether it ever crosses. */
  heat: { peakWbgtC: number; thresholdC: number; anyRestriction: boolean };
  /** True when no calibration coefficients were available. */
  uncalibrated: boolean;
}

/**
 * Wet-bulb temperature from dry bulb and relative humidity, after Stull (2011).
 *
 * The station *measures* wet bulb, which is why `deltaT()` is exact for today.
 * A forecast has no wet bulb, so a forward Delta-T has to approximate one. This
 * is stated on screen as well as here, because the two numbers look identical
 * and are not: Stull is accurate to about ±0.3 °C over normal conditions but is
 * fitted at sea-level pressure, and this site sits at 1527 m, where the true
 * wet bulb runs slightly lower than the formula returns.
 *
 * Valid for RH 5–99% and T −20…50 °C, which covers everything this site sees.
 */
export function wetBulbStull(tempC: number, humidityPct: number): number {
  const rh = Math.min(Math.max(humidityPct, 5), 99);
  return (
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
}

/** Local hour from a `YYYY-MM-DDTHH:MM` stamp. */
function hourOf(time: string): number {
  return Number(time.slice(11, 13));
}

/**
 * Groups consecutive passing hours of one band into windows.
 *
 * A window never spans the night gap, because non-daylight hours are already
 * marked failing — 17:00 and 06:00 next day are two windows, not one.
 */
export function outlookWindows(hours: OutlookHour[], band: OutlookBand): OutlookWindow[] {
  const windows: OutlookWindow[] = [];
  let run: OutlookHour[] = [];

  const flush = () => {
    if (!run.length) return;
    windows.push({
      band,
      start: run[0].time,
      end: run[run.length - 1].time,
      hours: run.length,
    });
    run = [];
  };

  for (const h of hours) {
    const passing = band === 'spray' ? h.spray.pass : h.drying.pass;
    if (passing) run.push(h);
    else flush();
  }
  flush();
  return windows;
}

/**
 * Turns an hourly forecast into forward decisions.
 *
 * Calls `assessSpray` and `assessDrying` unchanged, on a `Reading` synthesised
 * per hour, so the Delta-T band, the wind band and the humidity limit stay
 * defined in exactly one place. Only the daylight gate and the radiation
 * threshold are new here, and both are specific to looking forward.
 */
export function buildOutlook(f: HourlyForecast, coeffs: Coefficients | null): Outlook {
  const hours: OutlookHour[] = [];
  let nightHoursExcluded = 0;
  let peakWbgtC = -Infinity;

  const times = f.time ?? [];
  for (let i = 0; i < times.length; i++) {
    const time = times[i];

    // The calibration offsets were fitted against UTC hours, so convert before
    // looking one up. EAT is UTC+3 with no daylight saving.
    const utcHour = new Date(`${time}:00+03:00`).getUTCHours();

    const rawTemp = f.temperature_2m?.[i] ?? NaN;
    const rawHum = f.relative_humidity_2m?.[i] ?? NaN;
    const rawWind = f.wind_speed_10m?.[i] ?? NaN;

    const temp = calibrate(coeffs, 'tempC', rawTemp, utcHour);
    const hum = calibrate(coeffs, 'humidityPct', rawHum, utcHour);
    const wind = calibrate(coeffs, 'windSpeedMs', rawWind, utcHour);

    const tempC = temp.value;

    // Physical floors on the corrected values.
    //
    // `calibrate` subtracts a constant offset and knows nothing about what the
    // quantity means, which is correct — its bias-subtraction contract is
    // pinned by its own tests. But the fitted wind offset here is +1.73 m/s,
    // and this site forecasts sub-1 m/s mornings, so the raw result goes
    // *negative*: a 0.5 m/s forecast corrects to -1.23 m/s. Negative wind is
    // not a small error, it is not a wind speed at all, and left alone it
    // silently trips the inversion gate for the wrong reason. Humidity has the
    // same problem at the top of its range.
    const humidityPct = Math.min(Math.max(hum.value, 0), 100);
    const windSpeedMs = Math.max(wind.value, 0);
    const radiationWm2 = f.shortwave_radiation?.[i] ?? 0;
    const precipMm = f.precipitation?.[i] ?? 0;

    if (!Number.isFinite(tempC) || !Number.isFinite(humidityPct)) continue;

    const daylight = hourOf(time) >= FIELD_HOURS.first && hourOf(time) < FIELD_HOURS.last;

    // A Reading the existing gates understand. `wetBulbC` is approximated.
    //
    // `visCounts` is set above the station's daylight cutoff rather than left
    // at 0, so that `assessDrying`'s light gate is satisfied and the *humidity*
    // half of its verdict is what reaches us. The forward light test is the
    // radiation check below, in W/m². Leaving visCounts at 0 would apply two
    // different light gates to the same hour — the sensor-count proxy and the
    // physical one — and the sensor proxy would always win, making the
    // radiation threshold unreachable dead code.
    const synthetic: Reading = {
      ts: time,
      tempC,
      humidityPct,
      wetBulbC: wetBulbStull(tempC, humidityPct),
      wbgtC: NaN,
      pressureHpa: f.surface_pressure?.[i] ?? NaN,
      windSpeedMs,
      windDirDeg: NaN,
      windGustMs: NaN,
      visCounts: DAYLIGHT_PROXY_COUNTS,
      irCounts: 0,
      rainMm: precipMm,
    };

    // Rain within the hour itself gates both bands. The station path looks
    // ahead 6 h from a forecast; here the forecast *is* the timeline, so the
    // hour's own precipitation is the honest gate.
    const raining = precipMm > 0.1;

    const sprayAssessment = assessSpray(synthetic, raining);
    const dryingAssessment = assessDrying(synthetic, raining);

    const enoughLight = radiationWm2 >= DRYING_RADIATION_MIN_WM2;

    // Physics passed but the clock says no. Counted, because "29 sprayable
    // hours" would be a wildly misleading headline when 20 are nocturnal.
    if (!daylight && sprayAssessment.pass) nightHoursExcluded++;

    const sprayPass = daylight && sprayAssessment.pass;
    const dryingPass = daylight && enoughLight && dryingAssessment.pass;

    const sprayReason = !daylight
      ? 'Outside field hours'
      : sprayAssessment.pass
        ? ''
        : sprayAssessment.reason;

    const dryingReason = !daylight
      ? 'Outside field hours'
      : !enoughLight
        ? `Not enough sun — ${Math.round(radiationWm2)} W/m² against a ${DRYING_RADIATION_MIN_WM2} W/m² floor`
        : dryingAssessment.pass
          ? ''
          : dryingAssessment.reason;

    const projectedWbgtC = wbgtShade(tempC, humidityPct);
    if (Number.isFinite(projectedWbgtC)) peakWbgtC = Math.max(peakWbgtC, projectedWbgtC);

    hours.push({
      time,
      daylight,
      tempC: Math.round(tempC * 10) / 10,
      humidityPct: Math.round(humidityPct),
      windSpeedMs: Math.round(windSpeedMs * 10) / 10,
      radiationWm2: Math.round(radiationWm2),
      precipMm: Math.round(precipMm * 10) / 10,
      deltaTC: Math.round(deltaT(synthetic) * 10) / 10,
      projectedWbgtC: Math.round(projectedWbgtC * 10) / 10,
      spray: { pass: sprayPass, reason: sprayReason },
      drying: { pass: dryingPass, reason: dryingReason },
      // The single most important line in this file.
      provenance: temp.provenance === 'bias_corrected' ? 'bias_corrected' : 'raw_forecast',
    });
  }

  return {
    hours,
    windows: [...outlookWindows(hours, 'spray'), ...outlookWindows(hours, 'drying')],
    nightHoursExcluded,
    horizonHours: hours.length,
    heat: {
      peakWbgtC: Number.isFinite(peakWbgtC) ? Math.round(peakWbgtC * 10) / 10 : 0,
      thresholdC: HEAT_FIRST_ACTION_WBGT,
      anyRestriction: peakWbgtC >= HEAT_FIRST_ACTION_WBGT,
    },
    uncalibrated: coeffs === null,
  };
}
