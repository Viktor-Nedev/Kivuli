import type { Reading } from '../ingest/types.js';

/**
 * Heat-stress indices.
 *
 * Important context for this site: the Conduit station sits at ~1527 m in
 * Juja. Measured WBGT peaks near 21.5 °C in the available sample, well under
 * the 28 °C first action threshold. This module therefore reports "no heat
 * restriction" honestly rather than manufacturing an alert.
 */

/** Vapour pressure, hPa, from temperature and relative humidity. */
export function vapourPressure(tempC: number, humidityPct: number): number {
  return (humidityPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
}

/**
 * Shade WBGT approximation (Australian BoM form).
 * Used to project WBGT forward from forecast T and RH; when the station has
 * measured WBGT, prefer the measurement.
 */
export function wbgtShade(tempC: number, humidityPct: number): number {
  const e = vapourPressure(tempC, humidityPct);
  return 0.567 * tempC + 0.393 * e + 3.94;
}

export type WorkRestBand =
  | 'continuous'
  | 'work45_rest15'
  | 'work30_rest30'
  | 'work15_rest45'
  | 'stop';

export interface HeatAssessment {
  ts: string;
  wbgtC: number;
  band: WorkRestBand;
  /** Active-voice instruction for the crew. */
  instruction: string;
}

/**
 * ISO 7243 work/rest allocation, moderate workload, acclimatised worker.
 *
 * Indicative only. Real thresholds shift with workload, clothing,
 * acclimatisation and individual health. This is not medical or regulatory
 * advice and must not be presented as either.
 */
const BANDS: { max: number; band: WorkRestBand; instruction: string }[] = [
  { max: 28.0, band: 'continuous', instruction: 'Work through the hour — no heat restriction' },
  { max: 30.0, band: 'work45_rest15', instruction: 'Work 45 min, rest 15 min in shade' },
  { max: 31.5, band: 'work30_rest30', instruction: 'Work 30 min, rest 30 min in shade' },
  { max: 32.5, band: 'work15_rest45', instruction: 'Work 15 min, rest 45 min in shade' },
];

export function assessHeat(r: Reading): HeatAssessment {
  // Prefer the measured globe temperature; fall back to the shade estimate
  // only when the sensor value is missing.
  const wbgt = Number.isFinite(r.wbgtC) ? r.wbgtC : wbgtShade(r.tempC, r.humidityPct);
  const hit = BANDS.find((b) => wbgt < b.max);

  return {
    ts: r.ts,
    wbgtC: Number(wbgt.toFixed(1)),
    band: hit?.band ?? 'stop',
    instruction: hit?.instruction ?? 'Stop outdoor work until conditions ease',
  };
}

export type ThiBand = 'none' | 'mild' | 'moderate' | 'severe' | 'emergency';

export interface ThiAssessment {
  ts: string;
  thi: number;
  band: ThiBand;
  instruction: string;
}

/** Temperature-Humidity Index for dairy cattle (NRC form). */
export function thi(tempC: number, humidityPct: number): number {
  return 1.8 * tempC + 32 - (0.55 - 0.0055 * humidityPct) * (1.8 * tempC - 26);
}

const THI_BANDS: { max: number; band: ThiBand; instruction: string }[] = [
  { max: 68, band: 'none', instruction: 'No heat stress for dairy cattle' },
  { max: 72, band: 'mild', instruction: 'Mild heat stress — make sure water points are full' },
  { max: 80, band: 'moderate', instruction: 'Moderate heat stress — move cattle to shade, expect milk yield to drop' },
  { max: 90, band: 'severe', instruction: 'Severe heat stress — shade and active cooling needed now' },
];

export function assessThi(r: Reading): ThiAssessment {
  const value = thi(r.tempC, r.humidityPct);
  const hit = THI_BANDS.find((b) => value < b.max);
  return {
    ts: r.ts,
    thi: Number(value.toFixed(1)),
    band: hit?.band ?? 'emergency',
    instruction: hit?.instruction ?? 'Emergency heat stress — cool cattle immediately',
  };
}
