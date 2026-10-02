import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from './app.js';

test('GET /api/health responde ok', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  } finally {
    server.close();
  }
});

test('ruta inexistente devuelve 404', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://localhost:${port}/api/no-existe`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
