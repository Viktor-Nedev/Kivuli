import { useChartReveal } from '../lib/useChartReveal';

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
  // Reveals on scroll rather than on mount. Six of these sit below the fold on
  // the Station page, so the old mount-time animation had always finished by
  // the time anyone scrolled far enough to see it.
  const reveal = useChartReveal({ duration: 900 });

  const animated = min + (value - min) * reveal.progress;
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
    <div ref={reveal.ref} className="flex flex-col items-center" style={{ width: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-[135deg]"
        role="img"
        // `label` is optional, and four call sites omit it because a text
        // block beside the arc already names the value. Interpolating it
        // unconditionally announced "undefined: 24.3°C" to a screen reader on
        // every one of them.
        aria-label={label ? `${label}: ${value}${unit ?? ''}` : `${value}${unit ?? ''}`}
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
          style={{ transition: reveal.transition(0, 'stroke-dashoffset') }}
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
