import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from './app.js';
import { mutedError, NOT_HIDDEN } from './controllers/visitController.js';
import { csvCell } from './controllers/auditController.js';
import { diffChanges } from './utils/audit.js';

test('mutedError: solo bloquea mientras el silencio sigue vigente', () => {
  assert.equal(mutedError(null), null);
  assert.equal(mutedError({}), null);
  assert.equal(mutedError({ mutedUntil: new Date(Date.now() - 1000) }), null);
  assert.match(mutedError({ mutedUntil: new Date(Date.now() + 86400000) }), /silenciada/);
});

test('NOT_HIDDEN deja pasar las reseñas viejas sin el campo hidden', () => {
  assert.deepEqual(NOT_HIDDEN, { hidden: { $ne: true } });
});

test('csvCell: escapa comillas y neutraliza fórmulas de Excel', () => {
  assert.equal(csvCell('hola'), '"hola"');
  assert.equal(csvCell('dijo "hola"'), '"dijo ""hola"""');
  assert.equal(csvCell('=SUMA(A1)'), '"\'=SUMA(A1)"');
  assert.equal(csvCell(null), '""');
});

test('diffChanges: solo informa lo que cambió y no filtra contraseñas', () => {
  const changes = diffChanges({ name: 'A', city: 'X', password: 'hash' }, { name: 'B', city: 'X', password: 'nuevo' });
  assert.deepEqual(changes, [{ field: 'name', before: 'A', after: 'B' }]);
  assert.equal(diffChanges({ name: 'A' }, { name: 'A' }).length, 0);
});

test('diffChanges: recorta textos largos', () => {
  const [change] = diffChanges({ history: '' }, { history: 'x'.repeat(500) });
  assert.ok(change.after.length <= 121);
});

for (const [method, path] of [
  ['PATCH', '/api/visits/admin/64b000000000000000000000/hidden'],
  ['GET', '/api/visits/admin/all'],
  ['GET', '/api/audit/export'],
  ['GET', '/api/users/admin/64b000000000000000000000/activity'],
]) {
  test(`${method} ${path} exige iniciar sesión`, async () => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://localhost:${port}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'PATCH' ? '{}' : undefined });
      assert.equal(res.status, 401);
    } finally {
      server.close();
    }
  });
}
