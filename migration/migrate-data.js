// Copia los datos del respaldo de Mongo (migration/backup/<fecha>/) a PostgreSQL (DATABASE_URL).
// Vacía las tablas antes de copiar: se puede correr las veces que haga falta y el resultado es siempre el mismo.
// Los UUID salen del id de Mongo (siempre el mismo UUID para el mismo id), así los links no cambian entre corridas.
// No toca Mongo. Uso: node migration/migrate-data.js [carpeta-del-respaldo]   (sin carpeta: el respaldo más nuevo)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import prisma from '../src/config/prisma.js';

const { EJSON } = mongoose.mongo.BSON;
const backupRoot = path.join(import.meta.dirname, 'backup');
const dir = process.argv[2] || path.join(backupRoot, fs.readdirSync(backupRoot).sort().at(-1));
const load = (name) => EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'), { relaxed: true });

// UUID determinístico (formato v5) a partir del id de Mongo
const uuidOf = (mongoId) => {
  if (!mongoId) return null;
  const h = crypto.createHash('sha1').update(`giracanchera:${mongoId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
const id = (value) => (value ? String(value) : null);
// Orden de las listas (seguidos, por visitar, guardadas, likes): un milisegundo más por posición
const nth = (base, i) => new Date(new Date(base).getTime() + i);

// Se insertan en el orden de Mongo (_id): así la columna seq (orden de inserción) desempata igual que Mongo
const untie = (docs) => docs.sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1));

const clubs = untie(load('clubs'));
const stadiums = untie(load('stadia'));
const users = untie(load('users'));
const visits = untie(load('visits'));
const reports = untie(load('reports'));
const suggestions = untie(load('stadiumsuggestions'));
const audit = load('auditlogs');

// Referencias que apuntan a algo que ya no existe: se descartan y se informan
const existing = {
  club: new Set(clubs.map((c) => id(c._id))),
  stadium: new Set(stadiums.map((s) => id(s._id))),
  user: new Set(users.map((u) => id(u._id))),
  visit: new Set(visits.map((v) => id(v._id))),
};
const orphans = [];
const ref = (kind, value, where) => {
  const key = id(value);
  if (!key) return null;
  if (existing[kind].has(key)) return uuidOf(key);
  orphans.push(`${where}: ${kind} ${key}`);
  return null;
};
const refList = (kind, list, where) => [...new Set((list || []).map(id))].filter((key) => {
  if (existing[kind].has(key)) return true;
  orphans.push(`${where}: ${kind} ${key}`);
  return false;
});

await prisma.$executeRawUnsafe('TRUNCATE clubs, stadiums, users, audit_logs RESTART IDENTITY CASCADE');

await prisma.club.createMany({
  data: clubs.map((c) => ({
    id: uuidOf(id(c._id)), mongoId: id(c._id), name: c.name, logoUrl: c.logoUrl || '', location: c.location || '',
    createdAt: c.createdAt, updatedAt: c.updatedAt ?? c.createdAt,
  })),
});

await prisma.stadium.createMany({
  data: stadiums.map((s) => ({
    id: uuidOf(id(s._id)), mongoId: id(s._id), name: s.name, capacity: s.capacity,
    city: s.location.city, province: s.location.province || '', country: s.location.country,
    lat: s.location.coordinates.lat, lng: s.location.coordinates.lng,
    ownerType: s.ownerType || 'club', mainClubId: ref('club', s.mainClub, `estadio ${s.name}`),
    imageUrl: s.imageUrl || '', nickname: s.nickname || '', openedYear: s.openedYear ?? null,
    surface: s.surface || '', pitchLength: s.pitch?.length ?? null, pitchWidth: s.pitch?.width ?? null,
    status: s.status || '', history: s.history || '', funFacts: s.funFacts || [], otherUses: s.otherUses || [],
    wikidataDraft: s.wikidataDraft ? JSON.parse(JSON.stringify(s.wikidataDraft)) : undefined,
    createdAt: s.createdAt, updatedAt: s.updatedAt ?? s.createdAt,
  })),
});
await prisma.stadiumPhoto.createMany({
  data: stadiums.flatMap((s) => (s.photos || []).map((p, position) => ({
    stadiumId: uuidOf(id(s._id)), position, url: p.url, credit: p.credit || '',
  }))),
});

await prisma.user.createMany({
  data: users.map((u) => ({
    id: uuidOf(id(u._id)), mongoId: id(u._id), nombre: u.nombre ?? null, username: u.username, email: u.email,
    password: u.password, fechaNacimiento: u.fechaNacimiento ?? null,
    clubHinchaId: ref('club', u.clubHincha, `usuario @${u.username}`), rol: u.rol || 'user',
    avatarUrl: u.avatarUrl || '', bio: u.bio || '', mutedUntil: u.mutedUntil ?? null, tokenVersion: u.tokenVersion ?? 0,
    createdAt: u.createdAt, updatedAt: u.updatedAt ?? u.createdAt,
  })),
});
await prisma.follow.createMany({
  data: users.flatMap((u) => refList('user', u.following, `seguidos de @${u.username}`)
    .filter((other) => other !== id(u._id))
    .map((other, i) => ({ followerId: uuidOf(id(u._id)), followedId: uuidOf(other), createdAt: nth(u.createdAt, i) }))),
});
await prisma.wishlist.createMany({
  data: users.flatMap((u) => refList('stadium', u.wantToVisit, `por visitar de @${u.username}`)
    .map((stadium, i) => ({ userId: uuidOf(id(u._id)), stadiumId: uuidOf(stadium), createdAt: nth(u.createdAt, i) }))),
});

const visitRows = visits.filter((v) => existing.user.has(id(v.user)) && existing.stadium.has(id(v.stadium)));
visits.filter((v) => !visitRows.includes(v)).forEach((v) => orphans.push(`reseña ${id(v._id)} sin usuario o estadio`));
await prisma.visit.createMany({
  data: visitRows.map((v) => ({
    id: uuidOf(id(v._id)), mongoId: id(v._id), userId: uuidOf(id(v.user)), stadiumId: uuidOf(id(v.stadium)),
    visitDate: v.visitDate, rating: v.rating, reviewText: v.reviewText || '',
    hidden: v.hidden === true, hiddenReason: v.hiddenReason || '',
    homeTeam: v.matchDetails?.homeTeam || '', awayTeam: v.matchDetails?.awayTeam || '', score: v.matchDetails?.score || '',
    expenseTicket: v.expenses?.ticket ?? 0, expenseTransport: v.expenses?.transport ?? 0,
    expenseFood: v.expenses?.food ?? 0, expenseParking: v.expenses?.parking ?? 0, currency: v.expenses?.currency || 'ARS',
    createdAt: v.createdAt, updatedAt: v.updatedAt ?? v.createdAt,
  })),
});
const migratedVisits = new Set(visitRows.map((v) => id(v._id)));
await prisma.visitImage.createMany({
  data: visitRows.flatMap((v) => (v.images || []).map((url, position) => ({ visitId: uuidOf(id(v._id)), position, url }))),
});
await prisma.visitLike.createMany({
  data: visitRows.flatMap((v) => refList('user', v.likes, `likes de la reseña ${id(v._id)}`)
    .map((user, i) => ({ visitId: uuidOf(id(v._id)), userId: uuidOf(user), createdAt: nth(v.createdAt, i) }))),
});
await prisma.savedVisit.createMany({
  data: users.flatMap((u) => refList('visit', u.savedVisits, `guardadas de @${u.username}`)
    .filter((visit) => migratedVisits.has(visit))
    .map((visit, i) => ({ userId: uuidOf(id(u._id)), visitId: uuidOf(visit), createdAt: nth(u.createdAt, i) }))),
});

const reportRows = reports.filter((r) => migratedVisits.has(id(r.visit)) && existing.user.has(id(r.reporter)));
reports.filter((r) => !reportRows.includes(r)).forEach((r) => orphans.push(`denuncia ${id(r._id)} sin reseña o denunciante`));
await prisma.report.createMany({
  data: reportRows.map((r) => ({
    id: uuidOf(id(r._id)), mongoId: id(r._id), visitId: uuidOf(id(r.visit)), reporterId: uuidOf(id(r.reporter)),
    reason: r.reason, status: r.status || 'open', createdAt: r.createdAt, updatedAt: r.updatedAt ?? r.createdAt,
  })),
});

const suggestionRows = suggestions.filter((s) => existing.stadium.has(id(s.stadium)) && existing.user.has(id(s.author)));
suggestions.filter((s) => !suggestionRows.includes(s)).forEach((s) => orphans.push(`sugerencia ${id(s._id)} sin estadio o autor`));
await prisma.stadiumSuggestion.createMany({
  data: suggestionRows.map((s) => ({
    id: uuidOf(id(s._id)), mongoId: id(s._id), stadiumId: uuidOf(id(s.stadium)), authorId: uuidOf(id(s.author)),
    field: s.field, value: s.value, note: s.note || '', status: s.status || 'pending',
    createdAt: s.createdAt, updatedAt: s.updatedAt ?? s.createdAt,
  })),
});

// La auditoría guarda el id afectado como texto: si es un id de Mongo migrado, pasa a su UUID
const anyUuid = (value) => {
  const key = id(value);
  return key && [...Object.values(existing)].some((set) => set.has(key)) ? uuidOf(key) : key || '';
};
await prisma.auditLog.createMany({
  data: audit.map((a) => ({
    id: uuidOf(id(a._id)), mongoId: id(a._id), actorId: existing.user.has(id(a.actor)) ? uuidOf(id(a.actor)) : null,
    actorUsername: a.actorUsername || '', action: a.action, entity: a.entity, entityId: anyUuid(a.entityId),
    summary: a.summary, fields: a.fields || [], changes: (a.changes || []).map(({ field, before, after }) => ({ field, before, after })),
    createdAt: a.createdAt,
  })),
});

const counts = {
  clubes: await prisma.club.count(), estadios: await prisma.stadium.count(), fotos_estadio: await prisma.stadiumPhoto.count(),
  usuarios: await prisma.user.count(), seguidos: await prisma.follow.count(), por_visitar: await prisma.wishlist.count(),
  reseñas: await prisma.visit.count(), fotos_reseña: await prisma.visitImage.count(), likes: await prisma.visitLike.count(),
  guardadas: await prisma.savedVisit.count(), denuncias: await prisma.report.count(),
  sugerencias: await prisma.stadiumSuggestion.count(), auditoría: await prisma.auditLog.count(),
};
console.log(`Respaldo: ${dir}`);
console.table(counts);
if (orphans.length) console.log(`Referencias descartadas (${orphans.length}):\n  ${orphans.join('\n  ')}`);
else console.log('Sin referencias rotas.');
await prisma.$disconnect();
