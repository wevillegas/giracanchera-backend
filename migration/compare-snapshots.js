// Compara dos grabaciones de la API (por defecto: mongo contra postgres) y lista cada diferencia.
// Antes de comparar, los UUID de PostgreSQL se traducen al id de Mongo del que salieron (columna mongo_id),
// así una respuesta igual da igual aunque los ids sean otros.
// Diferencias que NO cuentan (decididas en el plan):
//   - el campo interno __v de Mongo y los campos viejos de usuarios que no se migran (friends, previousVisits)
//   - en reseñas viejas sin moderación: hidden ausente = false, hiddenReason ausente = ''
//   - un campo ausente contra uno con valor null (ej.: estadios sin ficha: Mongo omite pitch/openedYear)
//   - el orden entre empatados en las estadísticas (Mongo los devuelve en cualquier orden)
// Uso: node migration/compare-snapshots.js [antes=mongo] [después=postgres]
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/config/prisma.js';

const [before = 'mongo', after = 'postgres'] = process.argv.slice(2);
const root = path.join(import.meta.dirname, 'snapshots');
const readIndex = (label) => JSON.parse(fs.readFileSync(path.join(root, label, '_index.json'), 'utf8'));
const readBody = (label, file) => JSON.parse(fs.readFileSync(path.join(root, label, file), 'utf8'));

// UUID → id de Mongo, de todas las tablas que lo guardan
const tables = ['clubs', 'stadiums', 'users', 'visits', 'reports', 'stadium_suggestions', 'audit_logs'];
const toMongo = new Map();
for (const table of tables) {
  const rows = await prisma.$queryRawUnsafe(`SELECT id::text AS id, mongo_id FROM ${table} WHERE mongo_id IS NOT NULL`);
  rows.forEach((r) => toMongo.set(r.id, r.mongo_id));
}
await prisma.$disconnect();

const UUID_RX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const translate = (text) => text.replace(UUID_RX, (uuid) => toMongo.get(uuid.toLowerCase()) ?? uuid);

// __v es interno de Mongo; friends y previousVisits son campos viejos de usuarios que se decidió no migrar
const IGNORED_KEYS = new Set(['__v', 'friends', 'previousVisits']);
// Reseñas viejas de Mongo que no tienen el campo de moderación: equivale a "visible" (en Postgres, false y '')
const DEFAULT_IS_MISSING = { hidden: false, hiddenReason: '' };

// Endpoints donde Mongo devuelve en cualquier orden los empatados: se comparan las listas sin importar el orden
const UNORDERED = /^(stats-public|admin-stats-)/;

function normalize(value, unordered) {
  if (typeof value === 'string') return translate(value);
  if (Array.isArray(value)) {
    const list = value.map((v) => normalize(v, unordered));
    return unordered ? list.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : list;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (IGNORED_KEYS.has(key)) continue;
      const v = normalize(value[key], unordered);
      if (DEFAULT_IS_MISSING[key] === v) continue;
      const empty = v === null || v === undefined || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
      if (!empty) out[key] = v;
    }
    return out;
  }
  return value;
}

// Diferencias campo por campo (ruta: antes → después)
function diff(a, b, at = '', out = []) {
  if (out.length > 12) return out;
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const isObj = (v) => v && typeof v === 'object';
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${at || '/'}: ${a.length} elementos → ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) diff(a[i], b[i], `${at}[${i}]`, out);
    return out;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key], b[key], `${at}.${key}`, out);
    return out;
  }
  const show = (v) => (v === undefined ? '(falta)' : JSON.stringify(v)?.slice(0, 80));
  out.push(`${at || '/'}: ${show(a)} → ${show(b)}`);
  return out;
}

const afterByName = new Map(readIndex(after).map((entry) => [translate(entry.name), entry]));
const results = { iguales: [], distintas: [], faltan: [] };
const lines = [];
for (const entry of readIndex(before)) {
  const other = afterByName.get(entry.name);
  if (!other) { results.faltan.push(entry.name); continue; }
  const unordered = UNORDERED.test(entry.name);
  const a = readBody(before, entry.file);
  const b = readBody(after, other.file);
  const problems = [];
  if (a.status !== b.status) problems.push(`estado HTTP: ${a.status} → ${b.status}`);
  problems.push(...diff(normalize(a.body, unordered), normalize(b.body, unordered)));
  if (problems.length) {
    results.distintas.push(entry.name);
    lines.push(`✖ ${entry.name}  (${entry.url}${entry.as ? ` como @${entry.as}` : ''})`, ...problems.map((p) => `    ${p}`));
  } else {
    results.iguales.push(entry.name);
  }
}

const report = path.join(root, `diff-${before}-vs-${after}.txt`);
fs.writeFileSync(report, lines.join('\n'));
console.log(`Iguales: ${results.iguales.length}  ·  Distintas: ${results.distintas.length}  ·  Sin respuesta en "${after}": ${results.faltan.length}`);
if (results.distintas.length) console.log(`Detalle en ${report}`);
process.exitCode = results.distintas.length || results.faltan.length ? 1 : 0;
