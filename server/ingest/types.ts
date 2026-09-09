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
/**
 * The station's three independent dry-bulb thermometers.
 *
 * A BMX280, an MCP9808 and an SHT31 sit on the same mast measuring the same
 * air, and they disagree — by 0.44 °C on average and 1.60 °C at worst across
 * the bundled day. That disagreement is not an error to be averaged away. It
 * is the station's own measurement uncertainty, and it is the only honest
 * yardstick for how far correcting a forecast against this station is worth
 * pushing.
 *
 * Optional because a live feed may drop a channel. `Reading.tempC` stays the
 * canonical single value, so nothing downstream changes behaviour.
 */
export interface TempChannels {
  /** BMX280 — the channel `Reading.tempC` reports and the calibration was fitted to. */
  bmxC: number;
  /** MCP9808. */
  mcpC: number;
  /** SHT31 — the same sensor package as `humidityPct`. */
  shtC: number;
}

export interface Reading {
  /** Observation time, ISO-8601 UTC. */
  ts: string;
  /**
   * Dry-bulb air temperature, °C (BMX280).
   *
   * Deliberately one named channel rather than a median of `temps` below, for
   * three reasons a reader is entitled to ask about:
   *
   *   1. `analysis/calibrate.py` fitted `data/coefficients.json` against
   *      `temp_bmx`. Silently changing the runtime reference would make the
   *      published bias figures wrong without changing the number beside them.
   *   2. Delta-T is a *difference* against `wetBulbC`, a separate instrument.
   *      Pairing a median-of-three dry bulb against a single wet bulb changes
   *      what a validated agronomic threshold means.
   *   3. BMX runs 0.24 °C below the median of the three. That cost is
   *      published on the model-check page rather than quietly corrected —
   *      stating the offset is honest, hiding it behind a better number is not.
   */
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
  /**
   * All three dry-bulb thermometers, when the row carried them.
   *
   * Absent rather than partially filled: a spread computed from two of three
   * channels is not the same quantity as one computed from three, and silently
   * mixing them would understate the disagreement.
   */
  temps?: TempChannels;
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
