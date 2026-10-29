import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft, pickCandidate } from './wikidata.js';

const claim = (value) => ({ mainsnak: { datavalue: { value } } });
const entity = (id, claims) => ({ id, claims });
const point = (latitude, longitude) => [claim({ latitude, longitude })];
const stadium = (extra = {}) => ({ location: { coordinates: { lat: -34.6356, lng: -58.3647 } }, ...extra });

test('elige el candidato cercano y descarta los que están lejos o sin coordenadas', () => {
  const lejos = entity('Q1', { P625: point(-32.9, -60.6) });
  const sinCoords = entity('Q2', {});
  const cerca = entity('Q3', { P625: point(-34.6358, -58.3649) });
  assert.equal(pickCandidate(stadium(), [lejos, sinCoords, cerca]).id, 'Q3');
  assert.equal(pickCandidate(stadium(), [lejos, sinCoords]), null);
});

test('arma el borrador con apodo, año, estado e historia', () => {
  const e = entity('Q3', {
    P1449: [claim({ text: 'La Bombonera', language: 'es' })],
    P571: [claim({ time: '+1940-05-25T00:00:00Z' })],
    P576: [claim({ time: '+2001-01-01T00:00:00Z' })],
  });
  const draft = buildDraft(stadium(), e, 'Es un estadio.');
  assert.equal(draft.nickname, 'La Bombonera');
  assert.equal(draft.openedYear, 1940);
  assert.equal(draft.status, 'demolido');
  assert.equal(draft.history, 'Es un estadio.');
  assert.equal(draft.wikidataId, 'Q3');
});

test('no propone lo que el estadio ya tiene y devuelve null si no queda nada', () => {
  const e = entity('Q3', { P571: [claim({ time: '+1940-05-25T00:00:00Z' })] });
  assert.equal(buildDraft(stadium({ openedYear: 1938 }), e), null);
  assert.equal(buildDraft(stadium({ openedYear: 1938, history: 'x' }), e, 'texto'), null);
});

test('ignora años imposibles', () => {
  const e = entity('Q3', { P571: [claim({ time: '+3000-01-01T00:00:00Z' })] });
  assert.equal(buildDraft(stadium(), e), null);
});
