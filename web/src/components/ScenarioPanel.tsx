import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Section } from './Section';

/**
 * "What if the day were warmer, windier, drier?"
 *
 * ## Why this exists, and why it is not a fake alarm
 *
 * The station's record is honest and, for alerting purposes, quiet: across all
 * 13 measured days the peak wet-bulb globe temperature is 22.6 °C, more than
 * five degrees below the first ISO 7243 work/rest threshold. The heat watch
 * therefore never fires on real data, which leaves a detector nobody can tell
 * apart from a decorative one.
 *
 * The dishonest fix is to ship a hot day that never happened and let the alarm
 * go off. This is the honest one: every measurement stays as recorded, the
 * offset is stated on screen, and both columns are shown side by side so a
 * scenario figure can only be read as a comparison. The measured day is the
 * default and one tap away at all times.
 *
 * Every threshold crossed here belongs to the server's own index functions —
 * the panel sends offsets and renders what comes back, so it cannot disagree
 * with the rules the live page applies.
 */

interface Outcome {
  sprayOk: number;
  sprayTotal: number;
  sprayWindows: { start: string; end: string }[];
  peakWbgtC: number;
  heatBand: string;
  heatFires: boolean;
  commonestBlocker: string | null;
}

interface ScenarioResponse {
  day: string;
  offsets: { tempC: number; windMs: number; humidityPct: number };
  measured: Outcome;
  scenario: Outcome;
  isMeasured: boolean;
  limits: Record<'tempC' | 'windMs' | 'humidityPct', { min: number; max: number; step: number }>;
}

const ZERO = { temp: 0, wind: 0, humidity: 0 };

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Slider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-shade-200">{label}</span>
        <span className="font-display text-sm tabular-nums text-bleach">
          {value > 0 ? '+' : ''}
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-accent-400"
      />
    </label>
  );
}

function OutcomeColumn({
  title,
  outcome,
  tone,
  note,
}: {
  title: string;
  outcome: Outcome;
  tone: 'measured' | 'scenario';
  note: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === 'measured'
          ? 'border-white/10 bg-shade-800/40'
          : 'border-accent-400/30 bg-accent-700/10'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-sm uppercase tracking-[0.18em] text-shade-200">{title}</h3>
      </div>
      <p className="mt-1 text-micro text-shade-400">{note}</p>

      <dl className="mt-3 flex flex-col gap-2.5">
        <div>
          <dt className="text-micro uppercase tracking-[0.15em] text-shade-400">Peak WBGT</dt>
          <dd className="font-display text-xl tabular-nums text-bleach">
            {outcome.peakWbgtC} °C{' '}
            <span
              className={`text-xs uppercase tracking-[0.15em] ${
                outcome.heatFires ? 'text-kenya-red-400' : 'text-kenya-green-400'
              }`}
            >
              {outcome.heatFires ? 'rest breaks needed' : 'no restriction'}
            </span>
          </dd>
        </div>

        <div>
          <dt className="text-micro uppercase tracking-[0.15em] text-shade-400">Spray readings</dt>
          <dd className="text-sm text-bleach">
            <span className="font-display tabular-nums">
              {outcome.sprayOk} of {outcome.sprayTotal}
            </span>{' '}
            <span className="text-shade-200">suitable</span>
          </dd>
          {outcome.sprayWindows.length > 0 ? (
            <dd className="mt-1 text-micro text-shade-400">
              {outcome.sprayWindows
                .slice(0, 3)
                .map((w) => `${hhmm(w.start)}–${hhmm(w.end)}`)
                .join(', ')}
              {outcome.sprayWindows.length > 3 ? ` +${outcome.sprayWindows.length - 3} more` : ''}
            </dd>
          ) : (
            outcome.commonestBlocker && (
              <dd className="mt-1 text-micro text-shade-400">{outcome.commonestBlocker}</dd>
            )
          )}
        </div>
      </dl>
    </div>
  );
}

export function ScenarioPanel() {
  const [offsets, setOffsets] = useState(ZERO);
  const [day, setDay] = useState<string>('');
  const [days, setDays] = useState<string[]>([]);
  const [data, setData] = useState<ScenarioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  // Which days the record actually holds. A list, not a range: the exports
  // cover 28 Aug - 4 Sep and 11 - 15 Sep, and offering the missing week would
  // imply readings that do not exist.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/days')
      .then((r) => (r.ok ? (r.json() as Promise<{ days: string[] }>) : { days: [] }))
      .then((b) => {
        if (!cancelled) setDays(b.days ?? []);
      })
      .catch(() => {
        // The selector simply does not appear; the newest day still loads.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const query = useMemo(
    () =>
      `?temp=${offsets.temp}&wind=${offsets.wind}&humidity=${offsets.humidity}` +
      (day ? `&day=${day}` : ''),
    [offsets, day],
  );

  useEffect(() => {
    const ticket = ++latest.current;
    fetch(`/api/scenario${query}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ScenarioResponse>;
      })
      .then((body) => {
        // Sliders fire faster than the network answers; only the newest
        // request may paint, or an older reply can overwrite a newer one.
        if (ticket === latest.current) {
          setData(body);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (ticket === latest.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
  }, [query]);

  const reset = useCallback(() => setOffsets(ZERO), []);

  if (error && !data) {
    return (
      <Section title="What if the day were different?">
        <p className="text-sm text-shade-200">
          The scenario could not be run. <span className="text-shade-400">{error}</span>
        </p>
      </Section>
    );
  }

  if (!data) {
    return (
      <Section title="What if the day were different?">
        <p className="text-sm text-shade-400">Loading the measured day…</p>
      </Section>
    );
  }

  const limits = data.limits;

  return (
    <Section
      title="What if the day were different?"
      aside={
        !data.isMeasured && (
          <button
            type="button"
            onClick={reset}
            className="min-h-[44px] text-sm text-accent-400 transition-colors duration-200 hover:text-bleach"
          >
            Back to the measured day
          </button>
        )
      }
    >
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-shade-200">
        Shift this day&apos;s readings and watch the same decision rules run again. Across all 13
        measured days the hottest wet-bulb globe temperature was 22.6 °C, so the heat threshold is
        never crossed by real weather here — this is how to see the detector work without
        pretending a day happened that did not.
      </p>

      {days.length > 0 && (
        <label className="mb-5 flex flex-wrap items-center gap-3">
          <span className="text-sm text-shade-200">Day</span>
          <select
            value={data.day}
            onChange={(e) => setDay(e.target.value)}
            className="min-h-[44px] rounded-lg border border-white/10 bg-shade-800 px-3 text-sm text-bleach"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="text-micro text-shade-400">
            {days.length} days recorded; 5–10 September is absent from the record and is not
            offered.
          </span>
        </label>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-shade-800/40 p-4">
          <Slider
            label="Temperature"
            unit=" °C"
            value={offsets.temp}
            min={limits.tempC.min}
            max={limits.tempC.max}
            step={limits.tempC.step}
            onChange={(v) => setOffsets((o) => ({ ...o, temp: v }))}
          />
          <Slider
            label="Wind speed"
            unit=" m/s"
            value={offsets.wind}
            min={limits.windMs.min}
            max={limits.windMs.max}
            step={limits.windMs.step}
            onChange={(v) => setOffsets((o) => ({ ...o, wind: v }))}
          />
          <Slider
            label="Humidity"
            unit=" pts"
            value={offsets.humidity}
            min={limits.humidityPct.min}
            max={limits.humidityPct.max}
            step={limits.humidityPct.step}
            onChange={(v) => setOffsets((o) => ({ ...o, humidity: v }))}
          />
          <p className="text-micro leading-relaxed text-shade-400">
            Wet-bulb and globe temperatures are re-derived from the shifted air, so a scenario
            reading stays physically coherent. That makes it an estimate, which is why nothing here
            is labelled a measurement.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <OutcomeColumn
            title="As measured"
            tone="measured"
            note={`${data.day}, exactly as the station recorded it`}
            outcome={data.measured}
          />
          <OutcomeColumn
            title={data.isMeasured ? 'Scenario (no change)' : 'Scenario'}
            tone="scenario"
            note={
              data.isMeasured
                ? 'Move a slider to change this column'
                : `${data.offsets.tempC > 0 ? '+' : ''}${data.offsets.tempC} °C, ${
                    data.offsets.windMs > 0 ? '+' : ''
                  }${data.offsets.windMs} m/s, ${data.offsets.humidityPct > 0 ? '+' : ''}${
                    data.offsets.humidityPct
                  } humidity points`
            }
            outcome={data.scenario}
          />
        </div>
      </div>
    </Section>
  );
}
