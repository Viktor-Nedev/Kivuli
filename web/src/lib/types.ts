export type Provenance = 'measured' | 'bias_corrected' | 'raw_forecast';

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
