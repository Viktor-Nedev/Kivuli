import { useState } from 'react';
import type { AskResponse } from '../lib/types';
import { Section } from './Section';

/**
 * Ask KIVULI.
 *
 * Not a chatbot, and it should never be mistaken for one. Every answer is a
 * figure the app already computes and already tags with its provenance; this
 * only works out which page the reader meant and quotes it, naming the
 * endpoint the answer came from so it stays traceable.
 *
 * That constraint is the point. A language model would paraphrase numbers it
 * cannot verify, and this project's whole claim is that it never does. So an
 * unrecognised question returns the list of what can be answered rather than a
 * plausible guess — "I do not know, here is what I do know" is the honest
 * failure mode, and the one that keeps the rest of the app trustworthy.
 */
export function AskBox() {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<
    { phase: 'idle' } | { phase: 'asking' } | { phase: 'answered'; data: AskResponse }
  >({ phase: 'idle' });

  async function ask(q: string) {
    if (!q.trim()) return;
    setState({ phase: 'asking' });
    try {
      const r = await fetch(`/api/ask?q=${encodeURIComponent(q)}`);
      setState({ phase: 'answered', data: (await r.json()) as AskResponse });
    } catch {
      setState({
        phase: 'answered',
        data: {
          understood: false,
          answer: 'Could not reach the server to answer that.',
          capabilities: [],
        },
      });
    }
  }

  const data = state.phase === 'answered' ? state.data : null;

  return (
    <Section tone="raised" title="Ask KIVULI">
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        Every answer here is a number from one of the pages above, quoted with the page it came
        from. Nothing is generated — if the question is outside what this measures, it says so.
      </p>

      <form
        className="mt-5 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="ask" className="sr-only">
          Ask a question about the weather here
        </label>
        <input
          id="ask"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Can I spray tomorrow?"
          className="min-w-0 flex-1 rounded border border-shade-700 bg-shade-800 px-3 py-2 text-sm text-bleach placeholder:text-shade-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kenya-green-400"
        />
        <button
          type="submit"
          className="rounded border border-shade-600 px-4 py-2 font-display text-xs uppercase tracking-[0.2em] text-shade-200 transition-colors hover:border-kenya-green-400 hover:text-bleach"
        >
          Ask
        </button>
      </form>

      {state.phase === 'asking' && <p className="mt-4 text-sm text-shade-200">Looking it up…</p>}

      {data && (
        // aria-live so a screen reader hears the answer arrive; the panels
        // added in earlier phases appear silently and this one should not.
        <div aria-live="polite" className="mt-5">
          {data.understood ? (
            <div className="rounded-r-lg border-l-4 border-kenya-green-500 bg-shade-800/40 p-5">
              <p className="text-sm leading-relaxed text-bleach">{data.answer}</p>
              {data.answerSw && (
                <p lang="sw" className="mt-2 text-sm leading-relaxed text-shade-200">
                  {data.answerSw}
                </p>
              )}
              {data.source && (
                <p className="mt-3 text-xs text-shade-200">
                  Answered from <span className="font-mono">{data.source}</span> — the same figure
                  that page shows.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-r-lg border-l-4 border-shade-400 bg-shade-800/40 p-5">
              <p className="text-sm text-bleach">{data.answer}</p>
              {data.capabilities && data.capabilities.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {data.capabilities.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setQuestion(c.example);
                          void ask(c.example);
                        }}
                        className="rounded-full border border-shade-700 px-3 py-1 text-xs text-shade-200 transition-colors hover:border-kenya-green-400 hover:text-bleach"
                      >
                        {c.example}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
