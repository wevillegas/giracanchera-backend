// "Fotografía" de la API: llama a todas las rutas de lectura (como visitante, como cada usuario y como admin)
// y guarda cada respuesta en migration/snapshots/<etiqueta>/. Después de migrar a PostgreSQL se vuelve a correr
// y se comparan las dos carpetas: cualquier diferencia es un cambio de comportamiento a revisar.
// Solo hace pedidos GET: no modifica datos. Levanta la app en un puerto propio (no usa el servidor que ya corre).
// Uso: node migration/snapshot-api.js mongo
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import connectDB from '../src/config/db.js';
import { loadUsers, closeDB } from './snapshot-db.js';

const label = process.argv[2];
if (!label) {
  console.error('Falta la etiqueta: node migration/snapshot-api.js <mongo|postgres>');
  process.exit(1);
}
const outDir = path.join(import.meta.dirname, 'snapshots', label);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await connectDB();
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

// Sesión de cada usuario firmada con el mismo secreto que usa el login (no hace falta ninguna contraseña)
const users = await loadUsers();
const tokenOf = (user) => jwt.sign({ id: String(user.id), v: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
const admin = users.find((u) => u.rol === 'superadmin') ?? users.find((u) => u.rol === 'admin');

const index = [];
async function grab(name, url, user) {
  const res = await fetch(base + url, { headers: user ? { Authorization: `Bearer ${tokenOf(user)}` } : {} });
  const type = res.headers.get('content-type') || '';
  const body = type.includes('json') ? await res.json() : await res.text();
  const file = `${name.replace(/[^\w.-]+/g, '_')}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify({ url, as: user?.username ?? null, status: res.status, body }, null, 2));
  index.push({ name, url, as: user?.username ?? null, status: res.status, file });
  return body;
}

// Visitante sin sesión
const stadiums = await grab('stadiums', '/api/stadiums');
await grab('clubs', '/api/clubs');
await grab('clubs-list', '/api/clubs/list');
await grab('stats-public', '/api/stats/public');
for (const s of stadiums) {
  await grab(`stadium-${s._id}`, `/api/stadiums/${s._id}`);
  await grab(`stadium-visits-${s._id}`, `/api/visits/stadium/${s._id}`);
}
for (const u of users) {
  await grab(`user-${u.username}`, `/api/users/${u.id}`);
  await grab(`user-visits-${u.username}`, `/api/visits/user/${u.id}`);
}

// Cada usuario con su sesión
for (const me of users) {
  const tag = `as-${me.username}`;
  await grab(`${tag}-me`, '/api/auth/me', me);
  await grab(`${tag}-profile`, '/api/users/profile', me);
  await grab(`${tag}-my-stats`, '/api/users/me/stats', me);
  await grab(`${tag}-saved`, '/api/visits/saved', me);
  await grab(`${tag}-liked`, '/api/visits/liked', me);
  await grab(`${tag}-search-a`, '/api/users/search?username=a', me);
  for (const other of users) {
    await grab(`${tag}-user-${other.username}`, `/api/users/${other.id}`, me);
    await grab(`${tag}-user-visits-${other.username}`, `/api/visits/user/${other.id}`, me);
  }
}

// Panel de administración
if (admin) {
  const tag = 'admin';
  await grab(`${tag}-audit`, '/api/audit', admin);
  await grab(`${tag}-audit-p2`, '/api/audit?page=2', admin);
  await grab(`${tag}-audit-actors`, '/api/audit/actors', admin);
  await grab(`${tag}-audit-export`, '/api/audit/export', admin);
  await grab(`${tag}-drafts`, '/api/stadiums/drafts', admin);
  await grab(`${tag}-suggestions`, '/api/stadiums/suggestions', admin);
  for (const days of [7, 30, 90]) await grab(`${tag}-stats-${days}`, `/api/stats/admin?days=${days}`, admin);
  await grab(`${tag}-users`, '/api/users/admin/all', admin);
  for (const u of users) await grab(`${tag}-activity-${u.username}`, `/api/users/admin/${u.id}/activity`, admin);
  await grab(`${tag}-reports`, '/api/visits/reports', admin);
  await grab(`${tag}-visits`, '/api/visits/admin/all', admin);
  await grab(`${tag}-visits-hidden`, '/api/visits/admin/all?hidden=true', admin);
  await grab(`${tag}-visits-q`, '/api/visits/admin/all?q=estadio', admin);
}

fs.writeFileSync(path.join(outDir, '_index.json'), JSON.stringify(index, null, 2));
server.close();
await closeDB();
const failed = index.filter((r) => r.status >= 400);
console.log(`${index.length} respuestas guardadas en ${outDir}`);
if (failed.length) console.log(`Con error (${failed.length}):`, failed.map((r) => `${r.status} ${r.url}`).join(', '));
