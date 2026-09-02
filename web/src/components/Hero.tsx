import type { Instruction } from '../lib/types';
import { ProvenanceTag } from './Provenance';

const ACCENT: Record<Instruction['status'], string> = {
  go: 'text-sun-400',
  wait: 'text-sun-300',
  stop: 'text-ember',
};

const RULE: Record<Instruction['status'], string> = {
  go: 'bg-sun-400',
  wait: 'bg-sun-300',
  stop: 'bg-ember',
};

/**
 * The headline decision.
 *
 * This is the number-and-instruction someone reads across a room, so it is set
 * at display scale rather than dropped into a card grid.
 */
export function Hero({
  label,
  instruction,
  metric,
  metricUnit,
}: {
  label: string;
  instruction: Instruction;
  metric?: string;
  metricUnit?: string;
}) {
  return (
    <section className="border-t border-shade-700 py-8 sm:py-10">
      <div className="flex items-baseline gap-3">
        <span className={`h-3 w-3 rounded-full ${RULE[instruction.status]}`} aria-hidden />
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">{label}</h2>
        <ProvenanceTag kind="measured" title="Computed from Conduit station observations" />
      </div>

      <p
        className={`mt-3 font-display text-4xl leading-[1.05] sm:text-6xl ${ACCENT[instruction.status]}`}
      >
        {instruction.headline}
      </p>

      <p lang="sw" className="mt-2 font-display text-xl text-shade-200 sm:text-2xl">
        {instruction.headlineSw}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        {metric && (
          <div>
            <span className="font-display text-5xl text-bleach sm:text-6xl">{metric}</span>
            {metricUnit && <span className="ml-1 text-lg text-shade-200">{metricUnit}</span>}
          </div>
        )}
        {instruction.detail && (
          <p className="max-w-xl text-sm leading-relaxed text-shade-200">{instruction.detail}</p>
        )}
      </div>
    </section>
  );
}
