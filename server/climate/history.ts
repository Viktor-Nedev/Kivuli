import { OpenMeteoClient, SITE, type Site } from '../forecast/openMeteo.js';
import {
  annualTotals,
  harvestPotential,
  monthlyClimatology,
  onsetDistribution,
  seasonalPercentile,
  RUNOFF_COEFFICIENT,
  type Category,
  type DailyRain,
  type MonthClimate,
  type OnsetDistribution,
  type WindowStat,
  type YearTotal,
} from './rainfall.js';

/**
 * Assembles the climate page's payload from the ERA5 daily archive.
 *
 * Separate from `/api/today` on purpose. This pulls eleven years of daily
 * records; the decision cards need one day. Folding the two together would
 * make every visitor wait on a multi-year fetch before learning whether they
 * can spray this afternoon, and would let an archive outage take the whole
 * dashboard down with it.
 */

/** ERA5 starts well before this, but eleven years is enough to rank against
 *  and keeps the payload small. Fixed rather than relative so the cache key is
 *  stable across a day. */
const HISTORY_START = '2015-01-01';

/** Reference roof for the harvesting figure: a typical smallholder house. */
export const REFERENCE_ROOF_M2 = 60;

export interface ClimateSummary {
  /** The location these figures describe. Returned so the client renders the
   *  banner from the response rather than re-deriving which site it asked for. */
  site: Site;
  place: string;
  generatedAt: string;
  /** The last day present in the archive — everything is computed to here. */
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

/** Swahili month names, so the Swahili advisory is actually Swahili rather
 *  than a translated sentence with an English month dropped into it. */
const MONTHS_SW = [
  'Januari',
  'Februari',
  'Machi',
  'Aprili',
  'Mei',
  'Juni',
  'Julai',
  'Agosti',
  'Septemba',
  'Oktoba',
  'Novemba',
  'Desemba',
];

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Plain-language summary of where the season stands.
 *
 * Written to be copied into WhatsApp or SMS, so it carries its own context: a
 * bare "9th percentile" means nothing forwarded on its own. Bilingual for the
 * same reason the decision cards are — Swahili is the field-facing language.
 *
 * The wording is deliberately built from the *disagreement* between the short
 * and long windows. Saying only "driest in years" when the long rains were
 * normal would be the exact false alarm this feature exists to avoid.
 */
function buildAdvisory(
  windows: WindowStat[],
  climatology: MonthClimate[],
  throughDate: string,
  place: string,
): { en: string; sw: string } {
  const short = windows.find((w) => w.days === 90);
  const long = windows.find((w) => w.days === 180);
  const monthIndex = Number(throughDate.slice(5, 7)) - 1;
  const monthName = MONTHS[monthIndex] ?? '';
  const monthNameSw = MONTHS_SW[monthIndex] ?? '';
  const norm = climatology[monthIndex];
  const normallyDry = norm ? norm.balanceMm < 0 : false;

  if (!short || !long) {
    return {
      en: 'Not enough rainfall history to compare this season.',
      sw: 'Hakuna rekodi ya kutosha ya mvua kulinganisha msimu huu.',
    };
  }

  const dryShort = short.percentile < 25;
  const dryLong = long.percentile < 25;

  // Both windows dry: the seasonal rains themselves underperformed. This is
  // the only case that warrants the word "drought".
  if (dryShort && dryLong) {
    return {
      en:
        `KIVULI rainfall check (${place}, to ${throughDate}). ` +
        `Last 90 days ${short.totalMm} mm against a usual ${short.medianMm} mm, ` +
        `and the last 180 days are also below normal. ` +
        `Both the recent months and the last rainy season came in dry — ` +
        `plan for reduced water and stagger planting. Based on ${short.referenceYears} years of records.`,
      sw:
        `KIVULI ukaguzi wa mvua (${place}, hadi ${throughDate}). ` +
        `Siku 90 zilizopita mm ${short.totalMm} badala ya kawaida mm ${short.medianMm}, ` +
        `na siku 180 pia ziko chini ya kawaida. ` +
        `Msimu wa mvua uliopita haukutosha — panga kwa maji kidogo na gawanya upandaji. ` +
        `Kutokana na rekodi ya miaka ${short.referenceYears}.`,
    };
  }

  // Short window dry but the season was normal: the ordinary dry period. Say
  // so plainly instead of raising an alarm.
  if (dryShort && !dryLong) {
    return {
      en:
        `KIVULI rainfall check (${place}, to ${throughDate}). ` +
        `The last 90 days brought ${short.totalMm} mm, below the usual ${short.medianMm} mm — ` +
        `but ${monthName} is normally a dry month here, and the last 180 days sit at ` +
        `${long.totalMm} mm, which is normal. ` +
        `This is the dry season, not a failed one. Based on ${short.referenceYears} years of records.`,
      sw:
        `KIVULI ukaguzi wa mvua (${place}, hadi ${throughDate}). ` +
        `Siku 90 zilizopita zilileta mm ${short.totalMm}, chini ya kawaida mm ${short.medianMm} — ` +
        `lakini ${monthNameSw} huwa mwezi mkavu hapa, na siku 180 zina mm ${long.totalMm}, ` +
        `ambayo ni kawaida. Huu ni msimu wa kiangazi, si msimu ulioshindwa. ` +
        `Kutokana na rekodi ya miaka ${short.referenceYears}.`,
    };
  }

  if (short.percentile > 75 || long.percentile > 75) {
    return {
      en:
        `KIVULI rainfall check (${place}, to ${throughDate}). ` +
        `The last 90 days brought ${short.totalMm} mm against a usual ${short.medianMm} mm — ` +
        `wetter than most years. Check drainage and watch for waterlogging. ` +
        `Based on ${short.referenceYears} years of records.`,
      sw:
        `KIVULI ukaguzi wa mvua (${place}, hadi ${throughDate}). ` +
        `Siku 90 zilizopita zilileta mm ${short.totalMm} badala ya kawaida mm ${short.medianMm} — ` +
        `mvua nyingi kuliko miaka mingi. Angalia mifereji na tahadhari ya maji kujaa. ` +
        `Kutokana na rekodi ya miaka ${short.referenceYears}.`,
    };
  }

  const dryNote = normallyDry ? ` ${monthName} is normally dry here.` : '';
  const dryNoteSw = normallyDry ? ` ${monthNameSw} huwa mkavu hapa.` : '';
  return {
    en:
      `KIVULI rainfall check (${place}, to ${throughDate}). ` +
      `The last 90 days brought ${short.totalMm} mm against a usual ${short.medianMm} mm — ` +
      `close to normal.${dryNote} Based on ${short.referenceYears} years of records.`,
    sw:
      `KIVULI ukaguzi wa mvua (${place}, hadi ${throughDate}). ` +
      `Siku 90 zilizopita zilileta mm ${short.totalMm} badala ya kawaida mm ${short.medianMm} — ` +
      `karibu na kawaida.${dryNoteSw} Kutokana na rekodi ya miaka ${short.referenceYears}.`,
  };
}

/** Today in Kenya as `YYYY-MM-DD`. The whole country is UTC+3, no DST, so
 *  this holds for every site the Season page supports. */
function todayInNairobi(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

export async function loadClimate(
  meteo: OpenMeteoClient,
  site: Site = SITE,
  place = 'JKUAT',
): Promise<ClimateSummary> {
  const daily = await meteo.dailyArchive(HISTORY_START, todayInNairobi(), site);

  const series: DailyRain[] = daily.time.map((date, i) => ({
    date,
    mm: daily.precipitation_sum[i] ?? 0,
    et0Mm: daily.et0_fao_evapotranspiration[i] ?? 0,
  }));

  if (!series.length) throw new Error('ERA5 archive returned no days');

  const throughDate = series[series.length - 1].date;
  const windows: WindowStat[] = [30, 90, 180].map((d) =>
    seasonalPercentile(series, throughDate, d as 30 | 90 | 180),
  );
  const climatology = monthlyClimatology(series);
  const annual = annualTotals(series);

  const completeYears = annual.filter((y) => y.complete);
  const medianAnnualMm = Math.round(median(completeYears.map((y) => y.mm)) * 10) / 10;

  return {
    site,
    place,
    generatedAt: new Date().toISOString(),
    throughDate,
    referenceYears: {
      from: Number(series[0].date.slice(0, 4)),
      to: Number(throughDate.slice(0, 4)),
      n: windows[0]?.referenceYears ?? 0,
    },
    windows,
    climatology,
    annual,
    onset: {
      mam: onsetDistribution(series, 'MAM'),
      ond: onsetDistribution(series, 'OND'),
    },
    harvest: {
      medianAnnualMm,
      runoffCoeff: RUNOFF_COEFFICIENT,
      referenceRoofM2: REFERENCE_ROOF_M2,
      litresPerYear: harvestPotential(medianAnnualMm, REFERENCE_ROOF_M2),
      litresPerM2PerYear: harvestPotential(medianAnnualMm, 1),
    },
    advisory: buildAdvisory(windows, climatology, throughDate, place),
  };
}

export type { Category, WindowStat, MonthClimate, YearTotal, OnsetDistribution };
