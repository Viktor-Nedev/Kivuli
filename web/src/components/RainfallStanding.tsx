import type { MonthClimate, RainCategory, WindowStat } from '../lib/types';
import { ProvenanceTag } from './Provenance';

/**
 * Where this season's rainfall sits against the same window in previous years.
 *
 * The three windows are shown together, and that is the entire point rather
 * than a layout choice. At JKUAT right now the 90-day window sits in the 9th
 * percentile while the 180-day window sits at the 55th: the recent months are
 * genuinely dry, but the long rains arrived normally. A dashboard showing only
 * the 90-day figure would announce a drought that its own longer window
 * disproves.
 *
 * So the component leads with the disagreement instead of burying it, and the
 * reading below the cards is written to be understood without knowing what a
 * percentile is.
 */

const CATEGORY_LABEL: Record<RainCategory, string> = {
  'very-dry': 'Much drier than usual',
  dry: 'Drier than usual',
  normal: 'About normal',
  wet: 'Wetter than usual',
  'very-wet': 'Much wetter than usual',
};

// Dry reads red, wet reads blue-grey, normal reads green. Deliberately not a
// red-to-green ramp in one control: those two are the palette's known
// deuteranopia failure pair, so the categories are separated by lightness and
// by an explicit written label as well as by hue.
const CATEGORY_TEXT: Record<RainCategory, string> = {
  'very-dry': 'text-kenya-red-400',
  dry: 'text-amber-300',
  normal: 'text-kenya-green-400',
  wet: 'text-shade-200',
  'very-wet': 'text-shade-200',
};

const CATEGORY_BAR: Record<RainCategory, string> = {
  'very-dry': 'bg-kenya-red-500',
  dry: 'bg-amber-500',
  normal: 'bg-kenya-green-500',
  wet: 'bg-shade-400',
  'very-wet': 'bg-shade-400',
};

const WINDOW_LABEL: Record<number, string> = {
  30: 'Last 30 days',
  90: 'Last 90 days',
  180: 'Last 180 days',
};

const WINDOW_MEANING: Record<number, string> = {
  30: 'The month just gone',
  90: 'This season so far',
  180: 'Back through the last rains',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function WindowCard({ stat }: { stat: WindowStat }) {
  const pct = Math.max(0, Math.min(100, stat.percentile));
  return (
    <div className="rounded-xl border border-shade-700 bg-shade-800/40 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          {WINDOW_LABEL[stat.days] ?? `${stat.days} days`}
        </h3>
        <span className="text-[11px] text-shade-400">{WINDOW_MEANING[stat.days]}</span>
      </div>

      <p className="mt-4 font-display text-4xl tabular-nums text-bleach">
        {stat.totalMm.toFixed(0)}
        <span className="ml-1 text-base text-shade-200">mm</span>
      </p>
      <p className="mt-1 text-sm text-shade-200">
        usually <span className="tabular-nums">{stat.medianMm.toFixed(0)} mm</span> by now
      </p>

      {/* The percentile as a position on a track, so "9th" is legible as
          "near the bottom of the record" without reading the number. */}
      <div className="mt-4">
        <div className="relative h-2 overflow-hidden rounded-full bg-shade-900 ring-1 ring-shade-700">
          <span
            className={`absolute inset-y-0 left-0 ${CATEGORY_BAR[stat.category]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-shade-400">
          <span>driest</span>
          <span>wettest</span>
        </div>
      </div>

      <p className={`mt-3 font-display text-lg ${CATEGORY_TEXT[stat.category]}`}>
        {CATEGORY_LABEL[stat.category]}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-shade-200">
        Wetter than {stat.percentile}% of the same window in the last{' '}
        {stat.referenceYears} years.
      </p>
    </div>
  );
}

/**
 * The sentence that stops a dry season being read as a failed one.
 *
 * Built from the relationship between the short and long windows rather than
 * from either alone, because that relationship is the finding.
 */
function readingFor(
  windows: WindowStat[],
  climatology: MonthClimate[],
  throughDate: string,
): { headline: string; body: string; tone: 'alarm' | 'calm' | 'wet' } {
  const short = windows.find((w) => w.days === 90);
  const long = windows.find((w) => w.days === 180);
  if (!short || !long) {
    return {
      headline: 'Not enough history to compare',
      body: 'The rainfall archive did not return enough years to rank this season against.',
      tone: 'calm',
    };
  }

  const monthIndex = Number(throughDate.slice(5, 7)) - 1;
  const monthName = MONTHS[monthIndex] ?? 'this month';
  const norm = climatology[monthIndex];
  const dryShort = short.percentile < 25;
  const dryLong = long.percentile < 25;

  if (dryShort && dryLong) {
    return {
      headline: 'Both the recent months and the last rainy season came in dry',
      body:
        `The last 90 days brought ${short.totalMm.toFixed(0)} mm against a usual ` +
        `${short.medianMm.toFixed(0)} mm, and the 180-day window is low too — so this is not ` +
        `simply the dry season. Plan for reduced water availability.`,
      tone: 'alarm',
    };
  }

  if (dryShort && !dryLong) {
    return {
      headline: 'This is the dry season, not a failed one',
      body:
        `The last 90 days look low — ${short.totalMm.toFixed(0)} mm against a usual ` +
        `${short.medianMm.toFixed(0)} mm — but ${monthName} is normally dry here` +
        (norm ? `, averaging ${norm.rainMm.toFixed(0)} mm` : '') +
        `. The 180-day window reaches back through the last rains and sits at ` +
        `${long.totalMm.toFixed(0)} mm, which is normal. A drought warning from the 90-day ` +
        `figure alone would be wrong.`,
      tone: 'calm',
    };
  }

  if (short.percentile > 75 || long.percentile > 75) {
    return {
      headline: 'Wetter than most years on record',
      body:
        `The last 90 days brought ${short.totalMm.toFixed(0)} mm against a usual ` +
        `${short.medianMm.toFixed(0)} mm. Check drainage and watch for waterlogging.`,
      tone: 'wet',
    };
  }

  return {
    headline: 'Rainfall is close to normal for the time of year',
    body:
      `The last 90 days brought ${short.totalMm.toFixed(0)} mm against a usual ` +
      `${short.medianMm.toFixed(0)} mm, and the longer window agrees.`,
    tone: 'calm',
  };
}

const TONE_RULE: Record<'alarm' | 'calm' | 'wet', string> = {
  alarm: 'border-kenya-red-500',
  calm: 'border-kenya-green-500',
  wet: 'border-shade-400',
};

export function RainfallStanding({
  windows,
  climatology,
  throughDate,
  referenceYears,
}: {
  windows: WindowStat[];
  climatology: MonthClimate[];
  throughDate: string;
  referenceYears: { from: number; to: number; n: number };
}) {
  const reading = readingFor(windows, climatology, throughDate);

  return (
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Rainfall standing
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-shade-400">
            {referenceYears.from}–{referenceYears.to}
          </span>
          <ProvenanceTag
            kind="reanalysis"
            title="ERA5 reanalysis via Open-Meteo — a model reconstruction on a ~9 km grid, not this station's rain gauge"
          />
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        Each window is ranked against the <em>same calendar window</em> in every previous year, so
        the ordinary dry season does not register as an anomaly. Read the three together — one
        window on its own cannot tell a dry month apart from a failed season.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {windows.map((w) => (
          <WindowCard key={w.days} stat={w} />
        ))}
      </div>

      {/* The interpretation, stated rather than left to the reader. This is
          the component's reason to exist. */}
      <div className={`mt-6 rounded-r-lg border-l-4 bg-shade-800/40 p-5 ${TONE_RULE[reading.tone]}`}>
        <p className="font-display text-xl text-bleach">{reading.headline}</p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-shade-200">{reading.body}</p>
      </div>
    </section>
  );
}
