import { useEffect, useState } from 'react';

/**
 * Circular meter: fill carries the value's position in [min, max], track is a
 * lighter step of the same shade ramp so the two always read as one scale
 * rather than two unrelated colors.
 *
 * The needle animates from 0 on mount so every number arrives with motion —
 * requested across the whole app, not just once per page.
 */
export function Gauge({
  value,
  min,
  max,
  label,
  unit,
  color = '#5aa07d',
  size = 108,
}: {
  value: number;
  min: number;
  max: number;
  /** Omit to render the arc alone, e.g. beside a text block that already names it. */
  label?: string;
  unit?: string;
  /** Fill color for the arc; pick per-metric (heat = kenya-red, cool = shade-400, etc). */
  color?: string;
  size?: number;
}) {
  const [animated, setAnimated] = useState(min);

  useEffect(() => {
    // Defer to the next frame so the transition is observed from the start
    // value rather than skipping straight to the end.
    const raf = requestAnimationFrame(() => setAnimated(value));
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const clamped = Math.min(Math.max(animated, min), max);
  const fraction = max > min ? (clamped - min) / (max - min) : 0;

  const stroke = 8;
  const radius = size / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  // 270° sweep (3/4 circle) starting at -225deg, leaving a gap at the bottom
  // for the label — a full ring reads as a clock, not a gauge.
  const sweep = 0.75;
  const dashTotal = circumference * sweep;
  const dashOffset = dashTotal * (1 - fraction);

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-[135deg]"
        role="img"
        aria-label={`${label}: ${value}${unit ?? ''}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-shade-700"
          strokeWidth={stroke}
          strokeDasharray={`${dashTotal} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dashTotal} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="flex flex-col items-center" style={{ marginTop: -size * 0.52 }}>
        <span className="font-display text-2xl tabular-nums text-bleach">
          {value.toFixed(Number.isInteger(value) ? 0 : 1)}
          {unit && <span className="ml-0.5 text-sm text-shade-400">{unit}</span>}
        </span>
      </div>
      {label && (
        <span className="mt-6 text-center text-xs leading-tight text-shade-400">{label}</span>
      )}
    </div>
  );
}
