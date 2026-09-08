/**
 * "Ask KIVULI" — routing questions to answers that already exist.
 *
 * Explicitly **not** a language model. Every answer here is a number this app
 * already computes and already tags with its provenance; this module only
 * works out which one the reader meant. That constraint is the feature: an
 * LLM would paraphrase figures it cannot verify, and the whole project rests
 * on never doing that.
 *
 * So the contract is narrow and honest:
 *  - a matched question returns a real answer and names the endpoint it came
 *    from, so any reply can be traced back to a tagged number;
 *  - an unmatched question returns the list of what this can answer, never a
 *    guess. "I don't know, here is what I do know" beats a confident
 *    fabrication every time.
 *
 * Bilingual, because the advisories already are — a farmer asking
 * "naweza kunyunyiza?" should not have to ask it in English.
 */

export type IntentId = 'spray' | 'drying' | 'irrigate' | 'drought' | 'rain' | 'heat' | 'uv';

export interface Intent {
  id: IntentId;
  /** Which endpoint answers this — surfaced so a reply is traceable. */
  source: string;
  /** What the reader could type. Matched as whole words, both languages. */
  keywords: string[];
  /** Shown when nothing matches, so the capability list is honest. */
  example: string;
}

export const INTENTS: Intent[] = [
  {
    id: 'spray',
    source: '/api/outlook',
    keywords: ['spray', 'spraying', 'pesticide', 'herbicide', 'drift', 'nyunyiza', 'kunyunyiza', 'dawa'],
    example: 'Can I spray tomorrow?',
  },
  {
    id: 'drying',
    source: '/api/outlook',
    keywords: ['dry', 'drying', 'grain', 'harvest', 'anika', 'nafaka'],
    example: 'When can I dry grain?',
  },
  {
    id: 'irrigate',
    source: '/api/water',
    keywords: ['irrigate', 'irrigation', 'water', 'watering', 'thirsty', 'mwagilia', 'kumwagilia', 'maji'],
    example: 'Do I need to irrigate?',
  },
  {
    id: 'drought',
    source: '/api/climate',
    keywords: ['drought', 'dry season', 'season', 'compare', 'normal', 'ukame', 'msimu'],
    example: 'Is this a drought?',
  },
  {
    id: 'rain',
    source: '/api/outlook',
    keywords: ['rain', 'raining', 'wet', 'storm', 'mvua', 'kunyesha'],
    example: 'Is it going to rain?',
  },
  {
    id: 'heat',
    source: '/api/outlook',
    keywords: ['heat', 'hot', 'wbgt', 'work', 'rest', 'joto', 'kazi'],
    example: 'Is it too hot to work?',
  },
  {
    id: 'uv',
    source: '/api/water',
    keywords: ['uv', 'sun', 'sunburn', 'burn', 'ultraviolet', 'jua', 'ngozi'],
    example: 'How strong is the sun?',
  },
];

export interface IntentMatch {
  intent: Intent;
  /** Keywords that fired. Returned so a reply can show why it matched. */
  matched: string[];
}

/** Word characters plus spaces; everything else is punctuation to strip. */
function normalise(q: string): string {
  return q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
}

/**
 * Does this word carry the keyword?
 *
 * English matches whole words: "sunflower" is not a question about the sun.
 * Swahili cannot, because it agglutinates — "mwagilia" (irrigate) appears as
 * "nikamwagilia", "tumwagilie", "kumwagilia". So a Swahili stem is allowed to
 * match inside a longer word, which is how the language actually works.
 *
 * The stems are chosen to be long and distinctive enough that the looser rule
 * does not start firing on unrelated words.
 */
const SWAHILI_STEMS = new Set([
  'nyunyiza',
  'kunyunyiza',
  'mwagilia',
  'kumwagilia',
  'anika',
  'nafaka',
  'mvua',
  'ukame',
  'msimu',
  'maji',
  'joto',
  'kazi',
  'jua',
  'ngozi',
  'dawa',
]);

function hits(text: string, keyword: string): boolean {
  if (SWAHILI_STEMS.has(keyword)) return text.includes(keyword);
  return text.includes(` ${keyword} `);
}

/**
 * Best matching intent, or null.
 *
 * Scored by how many distinct keywords fire, so "should I water the maize"
 * resolves to irrigation rather than drying on the strength of "water".
 * A tie keeps the earlier intent, which orders the list by how specific the
 * question usually is.
 */
export function matchIntent(question: string): IntentMatch | null {
  const text = ` ${normalise(question)} `;
  let best: IntentMatch | null = null;

  for (const intent of INTENTS) {
    const matched = intent.keywords.filter((k) => hits(text, k));
    if (matched.length && (!best || matched.length > best.matched.length)) {
      best = { intent, matched };
    }
  }
  return best;
}

/** What this can answer. Returned verbatim when nothing matches. */
export function capabilities(): { id: IntentId; example: string; source: string }[] {
  return INTENTS.map((i) => ({ id: i.id, example: i.example, source: i.source }));
}
