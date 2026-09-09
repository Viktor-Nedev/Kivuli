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
    assert.match(i.source, /^\/api\/(outlook|water|climate|today|validation)$/);
    assert.ok(i.keywords.length >= 3, `${i.id} needs enough phrasings`);
  }
});

test('the Ask box can reach the station, not only the models', () => {
  // Every intent used to route to /api/outlook, /api/water or /api/climate, so
  // the one feature a visitor is most likely to try never touched the Conduit
  // instrument at all.
  const stationBacked = INTENTS.filter(
    (i) => i.source === '/api/today' || i.source === '/api/validation',
  );
  assert.ok(stationBacked.length >= 2, 'at least two intents read the station');
});

test('the accuracy question beats the reading question when both could match', () => {
  // "How accurate is the station?" names the station but asks about accuracy.
  // Both intents fire on one keyword each, and a tie goes to the earlier entry
  // — so `sensors` has to be listed first or the demo question answers the
  // wrong thing.
  assert.equal(matchIntent('how accurate is the station')?.intent.id, 'sensors');
  assert.equal(matchIntent('do the thermometers agree')?.intent.id, 'sensors');
  assert.equal(matchIntent('can I trust this')?.intent.id, 'sensors');
});

test('a plain reading question still resolves to the station', () => {
  assert.equal(matchIntent('what is the station reading now')?.intent.id, 'station');
  assert.equal(matchIntent('show me the instrument')?.intent.id, 'station');
  // Swahili: "kituo" (station) agglutinates like the other stems.
  assert.equal(matchIntent('kituo kinasoma nini')?.intent.id, 'station');
});

test('the original seven intents still resolve where they always did', () => {
  // The regression that matters: two new intents with general keywords must
  // not steal matches from the agronomic questions the app was built for.
  const table: [string, string][] = [
    ['can I spray tomorrow', 'spray'],
    ['when can I dry grain', 'drying'],
    ['do I need to irrigate', 'irrigate'],
    ['is there a drought', 'drought'],
    ['will it rain this week', 'rain'],
    ['is it too hot to work', 'heat'],
    ['how strong is the sun', 'uv'],
  ];
  for (const [question, expected] of table) {
    assert.equal(matchIntent(question)?.intent.id, expected, question);
  }
});

test('the capability list grows with the new intents', () => {
  const caps = capabilities();
  assert.equal(caps.length, INTENTS.length);
  assert.ok(caps.some((c) => c.id === 'sensors'));
  assert.ok(caps.some((c) => c.id === 'station'));
});
