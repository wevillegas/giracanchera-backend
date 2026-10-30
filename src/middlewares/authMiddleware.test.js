import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { protect, adminOnly, superAdminOnly } from './authMiddleware.js';
import { imageFilter } from './uploadMiddleware.js';
import { isId } from '../utils/validation.js';

process.env.JWT_SECRET = 'x'.repeat(40);

// Simula la respuesta de Express y devuelve el status que se envió
const run = async (middleware, req) => {
  const out = { nexted: false };
  const res = { status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; } };
  await middleware(req, res, () => { out.nexted = true; });
  return out;
};

const tokenFor = (id, v) => jwt.sign({ id, v }, process.env.JWT_SECRET);
// Simula la base: la sesión busca al usuario por id con prisma.user.findUnique
const U1 = '7c1f6a9e-0b4d-5c2a-9e8f-1a2b3c4d5e6f';
const stubUser = (user) => { prisma.user.findUnique = async () => user; };

test('protect: sin token responde 401', async () => {
  const out = await run(protect, { headers: {} });
  assert.equal(out.status, 401);
  assert.equal(out.nexted, false);
});

test('protect: token con tokenVersion vieja responde 401', async () => {
  stubUser({ id: U1, tokenVersion: 2 });
  const out = await run(protect, { headers: { authorization: `Bearer ${tokenFor(U1, 1)}` } });
  assert.equal(out.status, 401);
});

test('protect: token vigente deja pasar y carga el usuario', async () => {
  const user = { id: U1, tokenVersion: 1 };
  stubUser(user);
  const req = { headers: { authorization: `Bearer ${tokenFor(U1, 1)}` } };
  const out = await run(protect, req);
  assert.equal(out.nexted, true);
  assert.equal(req.user.id, user.id);
  assert.equal(req.user._id, user.id);
});

test('protect: acepta el token desde la cookie gc_token', async () => {
  const user = { id: U1, tokenVersion: 0 };
  stubUser(user);
  const req = { headers: { cookie: `otra=1; gc_token=${tokenFor(U1, 0)}` } };
  const out = await run(protect, req);
  assert.equal(out.nexted, true);
  assert.equal(req.user.id, user.id);
});

test('protect: un id que no es UUID responde 401 sin consultar la base', async () => {
  prisma.user.findUnique = async () => { throw new Error('no debía consultar la base'); };
  const out = await run(protect, { headers: { authorization: `Bearer ${tokenFor('abc', 0)}` } });
  assert.equal(out.status, 401);
});

test('adminOnly: un usuario común recibe 403, admin y superadmin pasan', async () => {
  assert.equal((await run(adminOnly, { user: { rol: 'user' } })).status, 403);
  assert.equal((await run(adminOnly, { user: { rol: 'admin' } })).nexted, true);
  assert.equal((await run(adminOnly, { user: { rol: 'superadmin' } })).nexted, true);
});

test('superAdminOnly: un admin recibe 403', async () => {
  assert.equal((await run(superAdminOnly, { user: { rol: 'admin' } })).status, 403);
  assert.equal((await run(superAdminOnly, { user: { rol: 'superadmin' } })).nexted, true);
});

test('imageFilter: acepta imágenes y rechaza otros tipos con 400', () => {
  let accepted;
  imageFilter({}, { mimetype: 'image/png' }, (err, ok) => { accepted = ok; });
  assert.equal(accepted, true);
  let error;
  imageFilter({}, { mimetype: 'application/pdf' }, (err) => { error = err; });
  assert.equal(error.status, 400);
});

test('isId: solo acepta UUID', () => {
  assert.equal(isId(U1), true);
  assert.equal(isId('507f1f77bcf86cd799439011'), false);
  assert.equal(isId('abc'), false);
  assert.equal(isId({ $ne: null }), false);
});
