import { useEffect, useState } from 'react';

/**
 * Vertical thermometer, for temperature-family values specifically — the one
 * metaphor everyone already reads correctly without a legend.
 *
 * Fill color moves cool-to-warm-to-hot by value (shade blue, amber, kenya
 * red), the same severity logic as Gauge, just drawn as mercury rather than
 * an arc.
 */
export function Thermometer({
  value,
  min,
  max,
  label,
  height = 128,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  height?: number;
}) {
  const [animated, setAnimated] = useState(min);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimated(value));
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const clamped = Math.min(Math.max(animated, min), max);
  const fraction = max > min ? (clamped - min) / (max - min) : 0;

  const fillColor =
    fraction < 0.35 ? '#4a5f86' : fraction < 0.7 ? '#f2b955' : '#b8433a';

  const tubeHeight = height;
  const bulbSize = 22;
  const tubeWidth = 10;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-end" style={{ height: tubeHeight + bulbSize }}>
        {/* Track */}
        <div
          className="relative overflow-hidden rounded-full bg-shade-700"
          style={{ width: tubeWidth, height: tubeHeight }}
        >
          {/* Mercury, animated from the bottom */}
          <div
            className="absolute bottom-0 left-0 w-full rounded-full"
            style={{
              height: `${fraction * 100}%`,
              backgroundColor: fillColor,
              transition: 'height 900ms cubic-bezier(0.16, 1, 0.3, 1), background-color 500ms ease-out',
            }}
          />
        </div>
        {/* Bulb, overlapping the tube's base */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full ring-4 ring-shade-800"
          style={{
            width: bulbSize,
            height: bulbSize,
            backgroundColor: fillColor,
            transition: 'background-color 500ms ease-out',
          }}
        />
      </div>
      <span className="mt-2 font-display text-xl tabular-nums text-bleach">
        {value.toFixed(1)}
        <span className="ml-0.5 text-xs text-shade-400">°C</span>
      </span>
      <span className="mt-0.5 text-center text-[11px] leading-tight text-shade-400">{label}</span>
    </div>
  );
}
