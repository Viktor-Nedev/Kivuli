import type { Reading } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { hhmm } from '../lib/format';

/**
 * Current station observations.
 *
 * Only fields the Conduit station actually measures appear here. It carries no
 * soil, vegetation or water sensors, so no such figure is shown or implied.
 */
export function StationPanel({ reading, sourceName }: { reading: Reading; sourceName: string }) {
  const items = [
    { label: 'Air temperature', value: reading.tempC.toFixed(1), unit: '°C' },
    { label: 'Relative humidity', value: reading.humidityPct.toFixed(0), unit: '%' },
    { label: 'Wet bulb', value: reading.wetBulbC.toFixed(1), unit: '°C' },
    { label: 'WBGT', value: reading.wbgtC.toFixed(1), unit: '°C' },
    { label: 'Wind', value: reading.windSpeedMs.toFixed(1), unit: 'm/s' },
    { label: 'Pressure', value: reading.pressureHpa.toFixed(0), unit: 'hPa' },
  ];

  return (
    <section className="border-t border-shade-700 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Station at {hhmm(reading.ts)}
        </h2>
        <div className="flex items-center gap-2">
          <ProvenanceTag kind="measured" />
          <span className="text-xs text-shade-400">{sourceName}</span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <div key={it.label}>
            <dt className="text-xs leading-tight text-shade-400">{it.label}</dt>
            <dd className="mt-1 font-display text-2xl tabular-nums text-bleach">
              {it.value}
              <span className="ml-0.5 text-sm text-shade-400">{it.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
