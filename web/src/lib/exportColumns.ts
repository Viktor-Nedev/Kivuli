import type { Column } from './export';
import type { AgreementPoint, HourComparison, MonthClimate, TimelinePoint, YearTotal } from './types';

/**
 * Which columns each dataset exports, and what each one's provenance is.
 *
 * Kept beside the data rather than inside `export.ts` so that module stays a
 * generic, testable string transform. The provenance assignments here are the
 * editorial part: getting one wrong would put a `measured` tag on a model
 * output in a file nobody is watching.
 */

/** Shared across every export. Short, and true of all of them. */
const STATION_LIMITS = [
  'The station measures weather only. It records no soil moisture, no',
  'vegetation index, no water level and no water quality, and nothing in this',
  'file is derived from them.',
  'One station at one point. These figures describe this site and generalise',
  'to nothing beyond it.',
];

/** A timestamp as HH:MM in Kenya, for a human reading the file. */
function eatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The working day: every station reading with the gates KIVULI ran on it.
 *
 * This is the export that matters most — it is the Conduit's own measurements
 * beside the decision each one produced, which is the whole argument of the
 * project in one file.
 */
export const TIMELINE_COLUMNS: Column<TimelinePoint>[] = [
  { header: 'timestamp_utc', provenance: 'measured', value: (r) => r.ts },
  { header: 'time_eat', provenance: 'measured', value: (r) => eatClock(r.ts) },
  { header: 'temp_c', provenance: 'measured', value: (r) => r.tempC },
  { header: 'humidity_pct', provenance: 'measured', value: (r) => r.humidityPct },
  { header: 'wind_speed_ms', provenance: 'measured', value: (r) => r.windSpeedMs },
  // Delta-T, WBGT and THI are arithmetic on measured inputs. No instrument
  // reads them, and no model produced them, so neither existing tag fits.
  { header: 'delta_t_c', provenance: 'derived', value: (r) => r.deltaT },
  { header: 'wbgt_c', provenance: 'measured', value: (r) => r.wbgtC },
  { header: 'thi', provenance: 'derived', value: (r) => r.thi },
  { header: 'spray_ok', provenance: 'derived', value: (r) => r.spray.pass },
  { header: 'spray_reason', provenance: 'derived', value: (r) => r.spray.reason },
  { header: 'drying_ok', provenance: 'derived', value: (r) => r.drying.pass },
  { header: 'drying_reason', provenance: 'derived', value: (r) => r.drying.reason },
  { header: 'heat_band', provenance: 'derived', value: (r) => r.heatBand },
];

export const TIMELINE_NOTES = [
  ...STATION_LIMITS,
  '',
  'wbgt_c is measured directly by the station, not derived from temperature',
  'and humidity. delta_t_c is air temperature minus the measured wet bulb.',
  'The spray and drying columns are this app’s gates applied to the reading',
  'on the same row — they are decisions, not observations.',
];

/**
 * Station against model, hour by hour.
 *
 * `error` is signed model minus station, matching the sign convention in
 * `server/validation/groundTruth.ts`. Getting that backwards in an exported
 * file would invert the project's headline finding.
 */
export const VALIDATION_COLUMNS: Column<HourComparison>[] = [
  { header: 'hour_utc', provenance: 'measured', value: (r) => r.hour },
  { header: 'local_hour_eat', provenance: 'measured', value: (r) => r.localHour },
  { header: 'station_value', provenance: 'measured', value: (r) => r.stationValue },
  { header: 'model_value', provenance: 'reanalysis', value: (r) => r.modelValue },
  { header: 'error_model_minus_station', provenance: 'derived', value: (r) => r.error },
  { header: 'paired_readings', provenance: 'measured', value: (r) => r.n },
];

export const VALIDATION_NOTES = [
  ...STATION_LIMITS,
  '',
  'error_model_minus_station is signed: negative means the model read lower',
  'than the station. Station values are hourly means of the 15-minute record;',
  'model values are ERA5 reanalysis for the same hour on a ~9 km grid.',
];

/**
 * The three thermometers, reading the same air.
 *
 * All three columns are `measured` — this is the station disagreeing with
 * itself, which is the point. `spread_c` is the arithmetic on top.
 */
export const AGREEMENT_COLUMNS: Column<AgreementPoint>[] = [
  { header: 'timestamp_utc', provenance: 'measured', value: (r) => r.ts },
  { header: 'time_eat', provenance: 'measured', value: (r) => eatClock(r.ts) },
  { header: 'bmx280_c', provenance: 'measured', value: (r) => r.bmxC },
  { header: 'mcp9808_c', provenance: 'measured', value: (r) => r.mcpC },
  { header: 'sht31_c', provenance: 'measured', value: (r) => r.shtC },
  { header: 'median_c', provenance: 'derived', value: (r) => r.medianC },
  { header: 'spread_c', provenance: 'derived', value: (r) => r.spreadC },
];

export const AGREEMENT_NOTES = [
  ...STATION_LIMITS,
  '',
  'Three independent dry-bulb thermometers on one mast, measuring the same',
  'air at the same moment. spread_c is the gap between the warmest and the',
  'coolest — the station’s own measurement uncertainty.',
  'bmx280_c is the channel the rest of the app reports as the station',
  'temperature, and the one the calibration coefficients were fitted against.',
];

/**
 * Eleven years of annual rainfall totals.
 *
 * Every column is `reanalysis`: this is ERA5, a model reconstruction on a
 * ~9 km grid, and no instrument at this site recorded any of it. The station
 * measured one day; this is the record it sits inside.
 */
export const ANNUAL_COLUMNS: Column<YearTotal>[] = [
  { header: 'year', provenance: 'reanalysis', value: (r) => r.year },
  { header: 'rainfall_mm', provenance: 'reanalysis', value: (r) => r.mm },
  { header: 'days_with_data', provenance: 'reanalysis', value: (r) => r.days },
  // A partial year would otherwise read as a drought.
  { header: 'year_complete', provenance: 'reanalysis', value: (r) => r.complete },
];

export const ANNUAL_NOTES = [
  'ERA5 reanalysis via Open-Meteo — a model reconstruction on a roughly 9 km',
  'grid. Not a rain gauge, and not this station: the Conduit mast measured one',
  'day, and this is the record that day sits inside.',
  '',
  'year_complete is false where the year is still running or the archive is',
  'short. Those rows are not droughts and must not be ranked against full ones.',
];

/** The twelve-month water balance: what arrives against what leaves. */
export const CLIMATOLOGY_COLUMNS: Column<MonthClimate>[] = [
  { header: 'month', provenance: 'reanalysis', value: (r) => r.month },
  { header: 'mean_rain_mm', provenance: 'reanalysis', value: (r) => r.rainMm },
  { header: 'mean_et0_mm', provenance: 'reanalysis', value: (r) => r.et0Mm },
  { header: 'balance_mm', provenance: 'derived', value: (r) => r.balanceMm },
  { header: 'years_averaged', provenance: 'reanalysis', value: (r) => r.years },
];

export const CLIMATOLOGY_NOTES = [
  'ERA5 reanalysis via Open-Meteo, averaged per calendar month.',
  '',
  'balance_mm is rain minus reference evapotranspiration — arithmetic on the',
  'two columns before it, not a measurement. A negative month loses more water',
  'than it gains, which at this site is most of them.',
  'et0 is FAO-56 reference evapotranspiration for a standard grass surface, not',
  'the demand of any particular crop.',
];
