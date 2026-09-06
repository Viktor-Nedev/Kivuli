import test from 'node:test';
import assert from 'node:assert/strict';
import { assessUv, peakUv } from './uv.js';

/**
 * UV bands.
 *
 * The station's own UV channel is dead (0 on every sample row), so these
 * figures come from the forecast and are tagged as model output wherever they
 * appear. The bands themselves are the WHO/WMO Global Solar UV Index, not a
 * scale invented here.
 */

test('band boundaries follow the WHO table, with max exclusive', () => {
  assert.equal(assessUv('2026-09-05', 0).band, 'low');
  assert.equal(assessUv('2026-09-05', 2.9).band, 'low');
  assert.equal(assessUv('2026-09-05', 3).band, 'moderate');
  assert.equal(assessUv('2026-09-05', 5.9).band, 'moderate');
  assert.equal(assessUv('2026-09-05', 6).band, 'high');
  // 8 is the start of "very high" in the published grouping, not the end of "high".
  assert.equal(assessUv('2026-09-05', 8).band, 'very_high');
  assert.equal(assessUv('2026-09-05', 10.9).band, 'very_high');
  assert.equal(assessUv('2026-09-05', 11).band, 'extreme');
});

test('the measured forecast peak for this site lands in very high', () => {
  // 9.2-9.5 is what Open-Meteo returns for JKUAT across the current window.
  assert.equal(assessUv('2026-09-05', 9.45).band, 'very_high');
  assert.equal(assessUv('2026-09-06', 9.2).band, 'very_high');
});

test('every band carries a Swahili instruction distinct from the English', () => {
  for (const uv of [1, 4, 7, 9, 12]) {
    const a = assessUv('2026-09-05', uv);
    assert.ok(a.instruction.length > 0);
    assert.ok(a.instructionSw.length > 0);
    assert.notEqual(a.instruction, a.instructionSw);
  }
});

test('burn time falls as the index rises, and is withheld when meaningless', () => {
  assert.equal(assessUv('2026-09-05', 1).burnMinutes, null, 'no burn figure at a low index');
  const moderate = assessUv('2026-09-05', 4).burnMinutes!;
  const veryHigh = assessUv('2026-09-05', 9.45).burnMinutes!;
  assert.ok(veryHigh < moderate, `${veryHigh} should be shorter than ${moderate}`);
  assert.ok(veryHigh > 0 && veryHigh < 60, `expected minutes, got ${veryHigh}`);
});

test('a negative or non-finite index degrades to low rather than throwing', () => {
  assert.equal(assessUv('2026-09-05', -3).band, 'low');
  assert.equal(assessUv('2026-09-05', Number.NaN).band, 'low');
});

test('peakUv picks the worst day in the horizon', () => {
  const days = [
    assessUv('2026-09-05', 6.1),
    assessUv('2026-09-06', 9.4),
    assessUv('2026-09-07', 8.2),
  ];
  assert.equal(peakUv(days)?.date, '2026-09-06');
  assert.equal(peakUv([]), null);
});
