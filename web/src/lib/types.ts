export type Provenance = 'measured' | 'bias_corrected' | 'raw_forecast' | 'reanalysis';

export interface Tagged {
  value: number;
  provenance: Provenance;
  rawValue?: number;
}

export interface Instruction {
  headline: string;
  headlineSw: string;
  detail: string;
  status: 'go' | 'wait' | 'stop';
}

export interface Window {
  start: string;
  end: string;
}

export interface TimelinePoint {
  ts: string;
  tempC: number;
  humidityPct: number;
  windSpeedMs: number;
  deltaT: number;
  wbgtC: number;
  thi: number;
  spray: { pass: boolean; failures: string[]; reason: string };
  drying: { pass: boolean; reason: string };
  heatBand: string;
}

export interface VariableCoefficients {
  model: string;
  bias: number;
  n_train: number;
  metrics: {
    n: number;
    mae_before: number;
    mae_after: number;
    rmse_before: number;
    rmse_after: number;
  };
}

export interface Calibration {
  generated_at: string;
  source: string;
  validation: string;
  variables: Record<string, VariableCoefficients>;
  training_window: { from: string; to: string; station_hours: number; note: string };
}

export interface Reading {
  ts: string;
  tempC: number;
  humidityPct: number;
  wetBulbC: number;
  wbgtC: number;
  pressureHpa: number;
  windSpeedMs: number;
  windDirDeg: number;
  visCounts: number;
  rainMm: number;
}

export interface TodayResponse {
  source: string;
  latest: Reading;
  decisions: {
    ts: string;
    spray: Instruction & { assessment: { deltaT: number; windSpeedMs: number }; windows: Window[] };
    drying: Instruction & { window: Window | null };
    heat: { wbgtC: number; band: string; instruction: string };
    thi: { thi: number; band: string; instruction: string };
  } | null;
  timeline: TimelinePoint[];
  calibration: Calibration | null;
  forecastDegraded: boolean;
}

/* ---------------------------------------------------------------------------
 * Climate page. Served by `/api/climate`, fetched by ClimatePage itself rather
 * than by the layout: it reads eleven years of daily records, and the decision
 * cards must not wait on that.
 * ------------------------------------------------------------------------- */

export type RainCategory = 'very-dry' | 'dry' | 'normal' | 'wet' | 'very-wet';

export interface WindowStat {
  days: 30 | 90 | 180;
  totalMm: number;
  medianMm: number;
  percentile: number;
  /** Reference years behind the percentile. Shown, not hidden: with n this
   *  small the extremes are not finely resolved. */
  referenceYears: number;
  category: RainCategory;
}

export interface MonthClimate {
  month: number;
  rainMm: number;
  et0Mm: number;
  /** rain - evapotranspiration. Negative months lose more water than they gain. */
  balanceMm: number;
  years: number;
}

export interface YearTotal {
  year: number;
  mm: number;
  complete: boolean;
  days: number;
}

export interface OnsetDistribution {
  season: 'MAM' | 'OND';
  years: { year: number; onset: string | null }[];
  medianMonthDay: string | null;
  earliestMonthDay: string | null;
  latestMonthDay: string | null;
  spreadDays: number;
  observedYears: number;
}

export interface ClimateResponse {
  site: { latitude: number; longitude: number; timezone: string };
  degraded: boolean;
  detail?: string;
  generatedAt: string;
  throughDate: string;
  referenceYears: { from: number; to: number; n: number };
  windows: WindowStat[];
  climatology: MonthClimate[];
  annual: YearTotal[];
  onset: { mam: OnsetDistribution; ond: OnsetDistribution };
  harvest: {
    medianAnnualMm: number;
    runoffCoeff: number;
    referenceRoofM2: number;
    litresPerYear: number;
    litresPerM2PerYear: number;
  };
  advisory: { en: string; sw: string };
}
