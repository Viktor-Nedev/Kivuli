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
  /** Null when the flood model could not be reached. */
  river?: RiverOutlook | null;
  site: { latitude: number; longitude: number; timezone: string };
  /** Human-readable name of the location these figures describe. */
  place: string;
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

/* ---------------------------------------------------------------------------
 * Forward outlook. Served by `/api/outlook`, fetched by the pages that show it
 * rather than by the layout: the decision cards must not wait on a three-day
 * forecast, the same reasoning as `/api/climate`.
 * ------------------------------------------------------------------------- */

export interface OutlookHour {
  time: string;
  daylight: boolean;
  tempC: number;
  humidityPct: number;
  windSpeedMs: number;
  radiationWm2: number;
  precipMm: number;
  deltaTC: number;
  projectedWbgtC: number;
  spray: { pass: boolean; reason: string };
  drying: { pass: boolean; reason: string };
  /** Never `measured` — these are model values, not instrument readings. */
  provenance: Provenance;
}

export interface OutlookWindow {
  band: 'spray' | 'drying';
  start: string;
  end: string;
  hours: number;
}

export interface RainThreshold {
  mm: number;
  exceedances: number;
  /** Mean months between exceedances. Measured frequency, not a return period. */
  everyMonths: number;
}

export interface RainOutlook {
  level: 'none' | 'notable' | 'heavy';
  peakDayMm: number;
  peakDate: string | null;
  totalMm: number;
  peakPercentile: number;
  thresholds: RainThreshold[];
  referenceYears: number;
  horizonDays: number;
  headline: string;
  headlineSw: string;
  detail: string;
  detailSw: string;
}

export interface OutlookResponse {
  site: { latitude: number; longitude: number; timezone: string };
  place: string;
  degraded: boolean;
  detail?: string;
  generatedAt: string;
  hours: OutlookHour[];
  windows: OutlookWindow[];
  /** Hours that passed the physics but fall outside working hours. */
  nightHoursExcluded: number;
  horizonHours: number;
  heat: { peakWbgtC: number; thresholdC: number; anyRestriction: boolean };
  uncalibrated: boolean;
  rainOutlook: RainOutlook | null;
}

/* ---------------------------------------------------------------------------
 * Forward water balance and UV. Served by `/api/water`.
 * ------------------------------------------------------------------------- */

export interface BalanceDay {
  date: string;
  et0Mm: number;
  cropEtMm: number;
  rainMm: number;
  /** Chance of rain that day, %. Context beside the depth, not a multiplier. */
  rainProbabilityPct: number | null;
  /** Running depletion, mm. Soil-independent — the honest headline. */
  deficitMm: number;
}

export type SoilTexture = 'sand' | 'loamy_sand' | 'sandy_loam' | 'loam' | 'clay_loam' | 'clay';

export interface SoilProfile {
  texture: SoilTexture;
  label: string;
  labelSw: string;
  tawMm: number;
  rawMm: number;
  crossesOnDay: number | null;
  crossesDate: string | null;
}

export interface CropStage {
  id: string;
  label: string;
  labelSw: string;
  kc: number;
  rootDepthM: number;
  depletionFraction: number;
}

export interface WaterBalance {
  crop: CropStage;
  days: BalanceDay[];
  totalCropEtMm: number;
  totalRainMm: number;
  closingDeficitMm: number;
  soils: SoilProfile[];
  daysToActionRange: { earliest: number | null; latest: number | null };
  horizonDays: number;
  headline: string;
  headlineSw: string;
  detail: string;
  detailSw: string;
  /** Always `raw_forecast` — never an instrument reading. */
  provenance: Provenance;
}

export type UvBand = 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';

export interface UvAssessment {
  date: string;
  uvIndexMax: number;
  band: UvBand;
  /** Fitzpatrick III reference only, stated wherever it is shown. */
  burnMinutes: number | null;
  instruction: string;
  instructionSw: string;
}

export interface WaterResponse {
  site: { latitude: number; longitude: number; timezone: string };
  place: string;
  degraded: boolean;
  detail?: string;
  generatedAt: string;
  crops: CropStage[];
  balance: WaterBalance;
  uv: { days: UvAssessment[]; peak: UvAssessment | null };
}

/* ---------------------------------------------------------------------------
 * Station-versus-model validation. Served by `/api/validation`.
 * The one place `measured` is the reference rather than the caveat.
 * ------------------------------------------------------------------------- */

export type ValidatedVariable = 'tempC' | 'humidityPct' | 'windSpeedMs' | 'pressureHpa';

export interface HourComparison {
  hour: string;
  localHour: number;
  /** Station hourly mean — `measured`. */
  stationValue: number;
  /** Model value for the same hour — `reanalysis`. */
  modelValue: number;
  /** model − station. Negative means the model reads low. */
  error: number;
  n: number;
}

export interface VariableValidation {
  variable: ValidatedVariable;
  label: string;
  unit: string;
  hours: HourComparison[];
  bias: number;
  mae: number;
  rmse: number;
  worst: { hour: string; localHour: number; error: number } | null;
  diurnal: { localHour: number; meanError: number; n: number }[];
  n: number;
}

export interface ValidationResponse {
  station: { name: string; day: string; hours: number };
  degraded: boolean;
  detail?: string;
  generatedAt: string;
  variables: VariableValidation[];
}

/* ---------------------------------------------------------------------------
 * River discharge, on /api/climate. Only meaningful where a modelled reach
 * exists — see `hasReach`.
 * ------------------------------------------------------------------------- */

export interface DischargeDay {
  date: string;
  cumecs: number;
}

export interface RiverOutlook {
  /** False when the flood model has no reach here — then there is no reading. */
  hasReach: boolean;
  days: DischargeDay[];
  peakCumecs: number;
  peakDate: string | null;
  riseFactor: number | null;
  headline: string;
  headlineSw: string;
  detail: string;
}

/* Ask KIVULI. Routes a question to a figure the app already computes. */

export interface AskCapability {
  id: string;
  example: string;
  source: string;
}

export interface AskResponse {
  understood: boolean;
  question?: string;
  intent?: string;
  matched?: string[];
  /** The endpoint that answered — every reply stays traceable. */
  source?: string;
  answer?: string;
  answerSw?: string;
  degraded?: boolean;
  detail?: string;
  capabilities?: AskCapability[];
}
