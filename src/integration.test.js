// Pruebas de punta a punta contra PostgreSQL (la base de tests de Docker: TEST_DATABASE_URL).
// Cubren las escrituras (las lecturas las compara la grabación de la API). Sin TEST_DATABASE_URL se saltean.
// Cada corrida vacía la base de tests: nunca apuntar TEST_DATABASE_URL a la base de desarrollo o de producción.
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'falta TEST_DATABASE_URL';

let server;
let base;
let prisma;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = TEST_DB; // antes de cargar la app: el cliente de Prisma lee la URL al crearse
  process.env.JWT_SECRET ||= 'x'.repeat(40);
  ({ default: prisma } = await import('./config/prisma.js'));
  const { default: app } = await import('./app.js');
  await prisma.$executeRawUnsafe('TRUNCATE clubs, stadiums, users, audit_logs RESTART IDENTITY CASCADE');
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  if (skip) return;
  server.close();
  await prisma.$disconnect();
});

// Cliente HTTP mínimo que guarda la cookie de sesión de cada usuario
function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body ?? {}),
    put: (path, body) => call('PUT', path, body ?? {}),
    patch: (path, body) => call('PATCH', path, body ?? {}),
    del: (path, body) => call('DELETE', path, body),
  };
}

const ana = client();
const beto = client();
const admin = client();
const ids = {};

test('registro, login y sesión', { skip }, async () => {
  const club = await prisma.club.create({ data: { name: 'Club de Prueba' } });
  ids.club = club.id;

  let r = await ana.post('/auth/register', { username: 'Ana_1', email: 'ANA@x.com', password: 'clave1234', nombre: ' Ana ', clubHincha: club.id });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.username, 'ana_1', 'el usuario se guarda en minúsculas');
  assert.equal(r.data.user.email, 'ana@x.com');
  assert.equal(r.data.user.nombre, 'Ana');
  assert.equal(r.data.user.clubHincha.name, 'Club de Prueba');
  assert.equal(r.data.user.password, undefined, 'nunca devuelve la contraseña');
  ids.ana = r.data.user._id;

  r = await ana.post('/auth/register', { username: 'otra', email: 'ana@x.com', password: 'clave1234' });
  assert.equal(r.status, 400, 'email repetido');

  r = await beto.post('/auth/register', { username: 'beto', email: 'beto@x.com', password: 'clave1234' });
  ids.beto = r.data.user._id;
  r = await admin.post('/auth/register', { username: 'jefa', email: 'jefa@x.com', password: 'clave1234' });
  ids.admin = r.data.user._id;
  await prisma.user.update({ where: { id: ids.admin }, data: { rol: 'superadmin' } });

  r = await ana.post('/auth/login', { email: 'Ana@X.com', password: 'clave1234' });
  assert.equal(r.status, 200, 'el login no distingue mayúsculas en el email');
  r = await ana.post('/auth/login', { username: 'ana_1', password: 'mala1234' });
  assert.equal(r.status, 401);
  await ana.post('/auth/login', { username: 'ana_1', password: 'clave1234' });

  r = await ana.get('/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.data.username, 'ana_1');
});

test('estadios y clubes (admin)', { skip }, async () => {
  let r = await beto.post('/stadiums', { name: 'X' });
  assert.equal(r.status, 403, 'un usuario común no crea estadios');

  r = await admin.post('/stadiums', {
    name: 'Estadio Prueba', capacity: '30000', mainClub: ids.club,
    location: { city: 'Rosario', province: 'Santa Fe', country: 'Argentina', coordinates: { lat: -32.9, lng: -60.6 } },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.capacity, 30000);
  assert.equal(r.data.mainClub, ids.club, 'al crear, el club va como id (como antes)');
  ids.stadium = r.data._id;

  r = await admin.put(`/stadiums/${ids.stadium}`, {
    nickname: 'La Prueba', openedYear: '1950', pitch: { length: 105, width: '' },
    photos: [{ url: 'https://res.cloudinary.com/demo/image/upload/a.jpg', credit: 'Foto' }],
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.openedYear, 1950);
  assert.deepEqual(r.data.pitch, { length: 105, width: null });
  assert.equal(r.data.imageUrl, 'https://res.cloudinary.com/demo/image/upload/a.jpg', 'la primera foto es la portada');
  assert.equal(r.data.mainClub.name, 'Club de Prueba', 'al editar, el club va poblado (como antes)');

  r = await admin.put(`/stadiums/${ids.stadium}`, { ownerType: 'province' });
  assert.equal(r.data.mainClub, null, 'un estadio de la provincia no tiene club');
  await admin.put(`/stadiums/${ids.stadium}`, { ownerType: 'club', mainClub: ids.club });

  r = await admin.put('/stadiums/no-es-un-id', { nickname: 'x' });
  assert.equal(r.status, 404);

  r = await admin.post('/clubs', { name: 'Club Nuevo', location: 'Santa Fe' });
  assert.equal(r.status, 201);
  r = await admin.put(`/clubs/${r.data._id}`, { name: 'Club Renombrado' });
  assert.equal(r.data.name, 'Club Renombrado');
});

test('reseñas: crear, editar, me gusta, guardar, denunciar', { skip }, async () => {
  await ana.post(`/users/want-to-visit/${ids.stadium}`);
  let r = await ana.post('/visits', {
    stadium: ids.stadium, visitDate: '2026-09-30', rating: '8', reviewText: 'Muy bueno',
    matchDetails: { homeTeam: 'A', awayTeam: 'B', score: '2-1' }, expenses: { ticket: 1000, food: 500 },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.rating, 8);
  assert.equal(r.data.visitDate, '2026-09-30T00:00:00.000Z', 'la fecha no se corre de día');
  assert.deepEqual(r.data.expenses, { ticket: 1000, transport: 0, food: 500, parking: 0, currency: 'ARS' });
  ids.visit = r.data._id;

  r = await ana.get('/users/profile');
  assert.deepEqual(r.data.wantToVisit, [], 'al reseñar, el estadio sale de "por visitar"');
  assert.equal(r.data.visitedCount, 1);

  r = await ana.post('/visits', { stadium: ids.stadium, visitDate: '2026-09-30', rating: '7.5' });
  assert.equal(r.status, 400, 'la puntuación es un entero');

  r = await beto.put(`/visits/${ids.visit}`, { rating: 1 });
  assert.equal(r.status, 403, 'nadie edita la reseña de otro');
  r = await ana.put(`/visits/${ids.visit}`, { rating: 9, reviewText: 'Excelente' });
  assert.equal(r.data.rating, 9);

  r = await ana.post(`/visits/${ids.visit}/like`);
  assert.equal(r.status, 400, 'no se puede dar me gusta a la propia reseña');
  r = await beto.post(`/visits/${ids.visit}/like`);
  assert.deepEqual(r.data, { liked: true, likesCount: 1 });
  r = await beto.post(`/visits/${ids.visit}/like`);
  assert.deepEqual(r.data, { liked: false, likesCount: 0 });
  await beto.post(`/visits/${ids.visit}/like`);

  r = await beto.post(`/visits/${ids.visit}/save`);
  assert.deepEqual(r.data, { saved: true });
  r = await beto.get('/visits/saved');
  assert.equal(r.data[0]._id, ids.visit);
  assert.equal(r.data[0].stadium.name, 'Estadio Prueba');

  r = await beto.post(`/visits/${ids.visit}/report`, { reason: 'spam' });
  assert.equal(r.status, 201);
  r = await beto.post(`/visits/${ids.visit}/report`, { reason: 'otra vez' });
  assert.equal(r.status, 400, 'una denuncia por usuario');

  r = await admin.get('/visits/reports');
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].authorReportCount, 1);
  ids.report = r.data[0]._id;
});

test('moderación: ocultar, aviso al dueño y estadísticas', { skip }, async () => {
  let r = await admin.patch(`/visits/admin/${ids.visit}/hidden`, { hidden: true, reason: 'Contenido falso' });
  assert.deepEqual(r.data, { hidden: true });

  r = await beto.get(`/visits/stadium/${ids.stadium}`);
  assert.equal(r.data.length, 0, 'una reseña oculta no se ve en el estadio');
  r = await beto.get(`/visits/user/${ids.ana}`);
  assert.equal(r.data.length, 0, 'ni en el perfil, para los demás');
  r = await ana.get(`/visits/user/${ids.ana}`);
  assert.equal(r.data[0].hiddenReason, 'Contenido falso', 'el dueño la ve con el motivo');
  r = await beto.post(`/visits/${ids.visit}/like`);
  assert.equal(r.status, 404, 'no se puede dar me gusta a una reseña oculta');
  r = await beto.get('/visits/saved');
  assert.equal(r.data.length, 0, 'ni aparece en guardadas');
  r = await beto.get('/stats/public');
  assert.equal(r.data.totals.reviews, 0, 'ni cuenta en las estadísticas');

  await admin.patch(`/visits/admin/${ids.visit}/hidden`, { hidden: false });
  r = await beto.get('/stats/public');
  assert.equal(r.data.totals.reviews, 1);
  assert.equal(r.data.totals.avgRating, 9);

  r = await admin.get('/visits/admin/all?q=excelente');
  assert.equal(r.data.total, 1, 'la búsqueda del admin no distingue mayúsculas');
  assert.equal(r.data.items[0].likesCount, 1);
  assert.equal(r.data.items[0].reportCount, 1);

  r = await admin.get('/audit?entity=visit');
  assert.ok(r.data.logs.some((log) => log.summary.includes('Ocultó una reseña')), 'queda en la auditoría');
});

test('seguir, buscar y perfil público', { skip }, async () => {
  let r = await ana.post(`/users/follow/${ids.beto}`);
  assert.deepEqual(r.data.following, [ids.beto]);
  r = await ana.post(`/users/follow/${ids.ana}`);
  assert.equal(r.status, 400, 'nadie se sigue a sí mismo');
  await beto.post(`/users/follow/${ids.ana}`);

  r = await beto.get(`/users/${ids.ana}`);
  assert.equal(r.data.followersCount, 1);
  assert.equal(r.data.following[0].username, 'beto');
  assert.equal(r.data.email, undefined, 'el perfil público no muestra el email');
  r = await ana.get('/users/profile');
  assert.equal(r.data.following[0].followsViewer, true, '"te sigue": beto, a quien Ana sigue, también la sigue a ella');

  r = await ana.get('/users/search?username=BET');
  assert.deepEqual(r.data.map((u) => u.username), ['beto']);
  r = await ana.get('/users/search?username=%25');
  assert.equal(r.data.length, 0, 'un % se busca como texto, no como comodín');
});

test('sugerencias: crear, una pendiente por dato, aprobar', { skip }, async () => {
  let r = await beto.post(`/stadiums/${ids.stadium}/suggestions`, { field: 'pitchWidth', value: '68' });
  assert.equal(r.status, 201);
  r = await beto.post(`/stadiums/${ids.stadium}/suggestions`, { field: 'pitchWidth', value: '70' });
  assert.equal(r.status, 400, 'una sola pendiente por dato');

  r = await admin.get('/stadiums/suggestions');
  assert.equal(r.data.length, 1);
  r = await admin.patch(`/stadiums/suggestions/${r.data[0]._id}`, { action: 'approve' });
  assert.equal(r.status, 200);
  r = await beto.get(`/stadiums/${ids.stadium}`);
  assert.deepEqual(r.data.stadium.pitch, { length: 105, width: 68 }, 'aprobar aplica el cambio');
});

test('admin: silenciar y cambio de rol', { skip }, async () => {
  let r = await admin.put(`/users/admin/${ids.beto}`, { mutedDays: 7 });
  assert.equal(r.status, 200);
  r = await beto.post('/visits', { stadium: ids.stadium, visitDate: '2026-09-01', rating: 5 });
  assert.equal(r.status, 403, 'un usuario silenciado no publica');

  await admin.put(`/users/admin/${ids.beto}`, { rol: 'admin', mutedDays: 0 });
  r = await beto.get('/auth/me');
  assert.equal(r.status, 401, 'cambiar el rol cierra las sesiones abiertas');
  await beto.post('/auth/login', { username: 'beto', password: 'clave1234' });
  r = await beto.get('/users/admin/all');
  assert.equal(r.status, 200, 'ya es admin');
});

test('contraseña, cierre de sesión y borrado en cascada', { skip }, async () => {
  let r = await ana.put('/users/me/password', { currentPassword: 'clave1234', newPassword: 'nueva1234' });
  assert.equal(r.status, 200);
  r = await ana.get('/auth/me');
  assert.equal(r.status, 401, 'cambiar la contraseña cierra la sesión');
  r = await ana.post('/auth/login', { username: 'ana_1', password: 'nueva1234' });
  assert.equal(r.status, 200);

  await ana.post('/auth/logout');
  r = await ana.get('/auth/me');
  assert.equal(r.status, 401, 'después de cerrar sesión el token no vale');
  await ana.post('/auth/login', { username: 'ana_1', password: 'nueva1234' });

  r = await ana.del('/users/me', { password: 'nueva1234' });
  assert.equal(r.status, 200);
  const left = await Promise.all([
    prisma.visit.count(), prisma.visitLike.count(), prisma.savedVisit.count(), prisma.report.count(), prisma.follow.count(),
  ]);
  assert.deepEqual(left, [0, 0, 0, 0, 0], 'se van sus reseñas con sus likes, guardadas y denuncias, y sus seguidos');
  // La auditoría se guarda en segundo plano: se espera un momento a que aparezca
  let logged = false;
  for (let i = 0; i < 20 && !logged; i += 1) {
    r = await admin.get('/audit?entity=user');
    logged = r.data.logs.some((log) => log.summary.includes('Eliminó su cuenta') && log.actor === null && log.actorUsername === 'ana_1');
    if (!logged) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(logged, 'queda en la auditoría con su nombre aunque la cuenta ya no exista');

  r = await admin.del(`/stadiums/${ids.stadium}`);
  assert.equal(r.status, 200);
  r = await admin.del(`/clubs/${ids.club}`);
  assert.equal(r.status, 200);
});
