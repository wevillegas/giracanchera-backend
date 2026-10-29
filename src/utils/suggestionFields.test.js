import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSuggestion, suggestionUpdate } from './suggestionFields.js';

test('acepta sugerencias válidas', () => {
  assert.equal(checkSuggestion({ field: 'nickname', value: 'La Bombonera' }), null);
  assert.equal(checkSuggestion({ field: 'openedYear', value: '1940' }), null);
  assert.equal(checkSuggestion({ field: 'surface', value: 'natural', note: 'lo vi en persona' }), null);
  assert.equal(checkSuggestion({ field: 'capacity', value: '54000' }), null);
  assert.equal(checkSuggestion({ field: 'other', value: 'La dirección está mal' }), null);
});

test('rechaza campos desconocidos, vacíos o fuera de rango', () => {
  assert.ok(checkSuggestion({ field: 'name', value: 'x' }));
  assert.ok(checkSuggestion({ field: 'nickname', value: '   ' }));
  assert.ok(checkSuggestion({ field: 'openedYear', value: '1700' }));
  assert.ok(checkSuggestion({ field: 'surface', value: 'cemento' }));
  assert.ok(checkSuggestion({ field: 'capacity', value: 'mucha' }));
  assert.ok(checkSuggestion({ field: 'pitchLength', value: '500' }));
  assert.ok(checkSuggestion({ field: 'nickname', value: { ne: 1 } }));
  assert.ok(checkSuggestion({ field: 'nickname', value: 'ok', note: 'x'.repeat(301) }));
});

test('arma el cambio para aplicar al estadio', () => {
  assert.deepEqual(suggestionUpdate({ field: 'openedYear', value: ' 1940 ' }), { openedYear: 1940 });
  assert.deepEqual(suggestionUpdate({ field: 'pitchWidth', value: '68' }), { 'pitch.width': 68 });
  assert.deepEqual(suggestionUpdate({ field: 'nickname', value: ' Bombonera ' }), { nickname: 'Bombonera' });
  assert.equal(suggestionUpdate({ field: 'other', value: 'algo' }), null);
});
