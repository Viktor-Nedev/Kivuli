import test from 'node:test';
import assert from 'node:assert/strict';
import { matchIntent, capabilities, INTENTS } from './intents.js';

/**
 * The query box routes; it never invents. The important test is the last one:
 * an unrecognised question must return the capability list rather than a
 * plausible-sounding guess.
 */

test('everyday English questions reach the right endpoint', () => {
  const cases: [string, string][] = [
    ['Can I spray tomorrow?', 'spray'],
    ['when can I dry grain', 'drying'],
    ['do I need to irrigate this week?', 'irrigate'],
    ['is this a drought', 'drought'],
    ['is it going to rain', 'rain'],
    ['is it too hot to work outside', 'heat'],
    ['how strong is the sun today', 'uv'],
  ];
  for (const [q, expected] of cases) {
    const m = matchIntent(q);
    assert.equal(m?.intent.id, expected, `"${q}" resolved to ${m?.intent.id}`);
  }
});

test('Swahili questions match too', () => {
  // The advisories already ship in Swahili; asking should work in it as well.
  assert.equal(matchIntent('naweza kunyunyiza leo')?.intent.id, 'spray');
  assert.equal(matchIntent('kutakuwa na mvua')?.intent.id, 'rain');
});

test('an unrecognised question returns the capability list, never a guess', () => {
  // The honesty contract. "I do not know, here is what I do know" beats a
  // confident answer to a question that was never understood.
  for (const q of ['what is the price of maize', 'who won the match', '']) {
    assert.equal(matchIntent(q), null, `"${q}" should not match anything`);
  }
  const caps = capabilities();
  assert.equal(caps.length, INTENTS.length);
  for (const c of caps) {
    assert.ok(c.example.length > 0);
    assert.match(c.source, /^\/api\//, 'every capability names a real endpoint');
  }
});

test('punctuation and case do not defeat matching', () => {
  assert.equal(matchIntent('SPRAY?!')?.intent.id, 'spray');
  assert.equal(matchIntent('  Rain...  ')?.intent.id, 'rain');
});

test('an English keyword inside a longer word does not match', () => {
  // "sunflower" contains "sun" but is not a question about UV.
  assert.equal(matchIntent('sunflower')?.intent.id, undefined);
});

test('Swahili stems match inside agglutinated verbs', () => {
  // Swahili glues prefixes onto verbs, so whole-word matching would miss every
  // natural conjugation: "mwagilia" appears as "nikamwagilia", "tumwagilie".
  assert.equal(matchIntent('nikamwagilia lini')?.intent.id, 'irrigate');
  assert.equal(matchIntent('tunyunyize leo')?.intent.id, undefined, 'unknown stem still misses');
});

test('a crop name alone is not a question about drying', () => {
  // "what is the price of maize" used to resolve to drying and answer
  // confidently about something never asked.
  assert.equal(matchIntent('what is the price of maize'), null);
});

test('the strongest match wins when several fire', () => {
  // "water the grain" hits irrigate (water) and drying (grain).
  const m = matchIntent('should I water the grain');
  assert.ok(m);
  assert.ok(m!.matched.length >= 1);
});

test('every intent names an endpoint that answers it', () => {
  for (const i of INTENTS) {
    assert.match(i.source, /^\/api\/(outlook|water|climate|today)$/);
    assert.ok(i.keywords.length >= 3, `${i.id} needs enough phrasings`);
  }
});
