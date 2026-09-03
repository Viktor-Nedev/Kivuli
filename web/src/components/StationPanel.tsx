import type { Reading } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { hhmm } from '../lib/format';
import { Thermometer } from './Thermometer';
import { Gauge } from './Gauge';

/**
 * Current station observations.
 *
 * Only fields the Conduit station actually measures appear here. It carries no
 * soil, vegetation or water sensors, so no such figure is shown or implied.
 *
 * Every value gets a visual gauge, not just a number — ranges are padded past
 * the station's actual recorded extremes (14.8-26.2°C, 40-91%, 0-1.6 m/s,
 * 851-856 hPa) so a normal reading sits mid-scale rather than pinned to an edge.
 */
export function StationPanel({ reading, sourceName }: { reading: Reading; sourceName: string }) {
  return (
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Station at {hhmm(reading.ts)}
        </h2>
        <div className="flex items-center gap-2">
          <ProvenanceTag kind="measured" />
          <span className="text-xs text-shade-400">{sourceName}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
        <div className="lift-on-hover flex justify-center rounded-lg py-2">
          <Thermometer value={reading.tempC} min={5} max={35} label="Air temperature" />
        </div>
        <div className="lift-on-hover flex justify-center rounded-lg py-2">
          <Gauge
            value={reading.humidityPct}
            min={0}
            max={100}
            label="Relative humidity"
            unit="%"
            color="#4a5f86"
          />
        </div>
        <div className="lift-on-hover flex justify-center rounded-lg py-2">
          <Thermometer value={reading.wetBulbC} min={5} max={30} label="Wet bulb" />
        </div>
        <div className="lift-on-hover flex justify-center rounded-lg py-2">
          <Gauge value={reading.wbgtC} min={0} max={35} label="WBGT" unit="°C" color="#b8433a" />
        </div>
        <div className="lift-on-hover flex justify-center rounded-lg py-2">
          <Gauge
            value={reading.windSpeedMs}
            min={0}
            max={10}
            label="Wind speed"
            unit=" m/s"
            color="#8697b8"
          />
        </div>
        <div className="lift-on-hover flex justify-center rounded-lg py-2">
          <Gauge
            value={reading.pressureHpa}
            min={840}
            max={870}
            label="Pressure"
            unit=" hPa"
            color="#f2b955"
          />
        </div>
      </div>
    </section>
  );
}
