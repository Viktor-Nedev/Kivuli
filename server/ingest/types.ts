/**
 * Canonical shape of one Conduit station observation.
 *
 * Deliberately omits `si1145_uv`: it reads 0 for every row in the available
 * sample, so surfacing it would imply a working UV sensor we cannot evidence.
 *
 * The station measures weather only. There is no soil moisture, vegetation
 * index, water level or water quality field here, and none may be added
 * without a sensor to back it.
 */
export interface Reading {
  /** Observation time, ISO-8601 UTC. */
  ts: string;
  /** Dry-bulb air temperature, °C (BMX280). */
  tempC: number;
  /** Relative humidity, % (SHT31). */
  humidityPct: number;
  /** Wet-bulb temperature, °C — measured, not derived. */
  wetBulbC: number;
  /** Wet-bulb globe temperature, °C — measured. */
  wbgtC: number;
  /** Barometric pressure, hPa. Station sits at ~1527 m, so ~850 hPa is normal. */
  pressureHpa: number;
  /** Wind speed, m/s. */
  windSpeedMs: number;
  /** Wind direction, degrees from north. */
  windDirDeg: number;
  /** Wind gust, m/s. */
  windGustMs: number;
  /** Visible-light counts (SI1145). Raw sensor counts, not W/m². */
  visCounts: number;
  /** Infrared counts (SI1145). Raw sensor counts, not W/m². */
  irCounts: number;
  /** Tipping-bucket rainfall total for the period, mm. */
  rainMm: number;
}

/** Where a displayed number came from. Rendered in the UI beside the value. */
/**
 * Where a number came from. `reanalysis` covers ERA5: not measured by this
 * station and not a forecast of the future either, but a model's best
 * reconstruction of weather that has already happened. It gets its own label
 * because collapsing it into either of the others would misstate what it is.
 */
export type Provenance = 'measured' | 'bias_corrected' | 'raw_forecast' | 'reanalysis';

export interface Tagged<T> {
  value: T;
  provenance: Provenance;
  /** Present when provenance is `bias_corrected`: the uncorrected input. */
  rawValue?: number;
}

/** A source of station observations. Adapters implement this. */
export interface ConduitSource {
  /** Human-readable name of the active adapter, shown in the UI. */
  readonly name: string;
  /** Most recent observation available, or null if the source is empty. */
  getLatest(): Promise<Reading | null>;
  /** Observations within [from, to] inclusive, ascending by time. */
  getHistory(from: Date, to: Date): Promise<Reading[]>;
}
