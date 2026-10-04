import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isText, escapeRegex, safeParse, isNumberInRange, textWithin, isEmailFormat, isUsernameFormat, isDateValue,
} from './validation.js';

test('solo acepta texto como texto', () => {
  assert.equal(isText('hola'), true);
  assert.equal(isText({ $ne: null }), false);
  assert.equal(isText(['a']), false);
});

test('escapa caracteres de regex para buscar literal', () => {
  assert.equal(escapeRegex('a.*b'), 'a\\.\\*b');
  assert.equal(new RegExp(escapeRegex('(x+)')).test('(x+)'), true);
});

test('safeParse distingue JSON válido, vacío y roto', () => {
  assert.deepEqual(safeParse('{"a":1}'), { ok: true, value: { a: 1 } });
  assert.deepEqual(safeParse(undefined), { ok: true, value: undefined });
  assert.equal(safeParse('{roto').ok, false);
});

test('rangos numéricos y largos de texto', () => {
  assert.equal(isNumberInRange(10, 1, 10), true);
  assert.equal(isNumberInRange(11, 1, 10), false);
  assert.equal(isNumberInRange(NaN, 0, 10), false);
  assert.equal(textWithin('abc', 3), true);
  assert.equal(textWithin('abcd', 3), false);
});

test('formato de email y usuario', () => {
  assert.equal(isEmailFormat('ana@mail.com'), true);
  assert.equal(isEmailFormat('ana@mail'), false);
  assert.equal(isUsernameFormat('ana_99'), true);
  assert.equal(isUsernameFormat('a b'), false);
  assert.equal(isUsernameFormat('ab'), false);
});

test('fechas inválidas se detectan', () => {
  assert.equal(isDateValue('2026-05-01'), true);
  assert.equal(isDateValue('no es fecha'), false);
});
