import { useState } from 'react';
import { ProvenanceTag } from './Provenance';
import { Section } from './Section';

/**
 * The season summary as plain text, ready to be forwarded.
 *
 * Climate intelligence that only exists inside a dashboard reaches whoever
 * opens the dashboard. Most of the people this matters to will hear it from
 * someone else — an extension officer, a chairperson, a neighbour with the
 * link — through WhatsApp or SMS.
 *
 * Deliberately a copy button rather than a send button. Actually delivering
 * messages would need a gateway, a subscriber list and a database this project
 * does not have; pretending otherwise would be inventing infrastructure. Copy
 * is honest, works offline, and puts the choice of audience with the person
 * who knows it.
 *
 * The text is written server-side (`server/climate/history.ts`) so it carries
 * its own context: a forwarded "9th percentile" means nothing on its own, and
 * a forwarded message has no tooltip to explain itself.
 */
export function ShareAdvisory({ advisory }: { advisory: { en: string; sw: string } }) {
  const [lang, setLang] = useState<'en' | 'sw'>('en');
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const text = advisory[lang];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
      window.setTimeout(() => setStatus('idle'), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions policy),
      // and a demo served over plain HTTP is exactly where that happens. The
      // text is already on screen and selectable, so the fallback is to say so
      // plainly — this branch used to set the idle state, which showed nothing
      // at all and made the sentence above untrue.
      //
      // Deliberately not cleared on a timer: a failure message that disappears
      // after two seconds is one nobody reads.
      setStatus('failed');
    }
  }

  return (
      <Section
        tone="raised"
        title="Share this summary"
        aside={
          <ProvenanceTag kind="reanalysis" title="Summarised from ERA5 rainfall history" />
        }
      >

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        Written to be forwarded on WhatsApp or SMS, so it explains itself without the charts above.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-shade-700 bg-shade-800/40">
        <div className="flex items-center justify-between gap-3 border-b border-shade-700/60 px-4 py-2">
          <div className="flex gap-1" role="group" aria-label="Advisory language">
            {(['en', 'sw'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={`rounded px-3 py-1 font-display text-xs uppercase tracking-[0.2em] transition-colors ${
                  lang === code
                    ? 'bg-kenya-green-500/20 text-kenya-green-300'
                    : 'text-shade-400 hover:text-bleach'
                }`}
              >
                {code === 'en' ? 'English' : 'Kiswahili'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={copy}
            className="rounded border border-shade-600 px-3 py-1 font-display text-xs uppercase tracking-[0.2em] text-shade-200 transition-colors hover:border-kenya-green-400 hover:text-bleach"
          >
            {status === 'copied' ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* Announced, because a clipboard write that silently fails is
            indistinguishable from a button that does nothing. */}
        <p aria-live="polite" className="px-4 pt-3 text-xs text-shade-200">
          {status === 'copied' && (
            <span className="text-kenya-green-300">Copied to the clipboard.</span>
          )}
          {status === 'failed' && (
            <span className="text-amber-300">
              The browser refused the clipboard — select the text below and copy it by hand.
            </span>
          )}
        </p>

        {/* Selectable text, not just a button target: if the clipboard API is
            unavailable the message must still be obtainable by hand. */}
        <p
          lang={lang}
          className="px-4 py-4 text-sm leading-relaxed text-bleach selection:bg-kenya-green-500/30"
        >
          {text}
        </p>
      </div>
    </Section>
  );
}
