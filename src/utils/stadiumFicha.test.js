import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFichaInput, syncCover, removedPhotoUrls } from './stadiumFicha.js';

const photo = (id, credit = '') => ({ url: `https://res.cloudinary.com/demo/image/upload/${id}.jpg`, credit });

test('sin campos de ficha es válido (estadios existentes no se rompen)', () => {
  assert.equal(checkFichaInput({ name: 'La Bombonera' }), null);
});

test('acepta una ficha completa', () => {
  const ficha = {
    nickname: 'La Bombonera', openedYear: '1940', surface: 'natural', status: 'activo',
    pitch: { length: 105, width: 68 }, history: 'Texto', funFacts: ['a'], otherUses: ['Recitales'],
    photos: [photo('a', 'Foto: Ana')],
  };
  assert.equal(checkFichaInput(ficha), null);
});

test('rechaza valores fuera de rango o de lista', () => {
  assert.ok(checkFichaInput({ openedYear: 1700 }));
  assert.ok(checkFichaInput({ surface: 'cemento' }));
  assert.ok(checkFichaInput({ status: 'roto' }));
  assert.ok(checkFichaInput({ pitch: { length: 500 } }));
  assert.ok(checkFichaInput({ history: 'x'.repeat(3001) }));
  assert.ok(checkFichaInput({ funFacts: Array(9).fill('a') }));
  assert.ok(checkFichaInput({ nickname: { $ne: null } }));
});

test('fotos: máximo 4 y solo Cloudinary', () => {
  assert.equal(checkFichaInput({ photos: [photo('a'), photo('b'), photo('c'), photo('d')] }), null);
  assert.ok(checkFichaInput({ photos: [photo('a'), photo('b'), photo('c'), photo('d'), photo('e')] }));
  assert.ok(checkFichaInput({ photos: [{ url: 'https://evil.com/x.png' }] }));
});

test('la portada es la primera foto', () => {
  assert.equal(syncCover({ photos: [photo('a'), photo('b')] }).imageUrl, photo('a').url);
  assert.equal(syncCover({ photos: [] }).imageUrl, '');
  assert.equal(syncCover({ name: 'x' }).imageUrl, undefined);
});

test('detecta las fotos quitadas para borrarlas de Cloudinary', () => {
  const old = { photos: [photo('a'), photo('b')], imageUrl: photo('a').url };
  assert.deepEqual(removedPhotoUrls(old, { photos: [photo('b')] }), [photo('a').url]);
  assert.deepEqual(removedPhotoUrls(old, { name: 'x' }), []);
});
