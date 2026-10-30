// Respaldo completo de MongoDB antes de migrar: cada colección a un archivo JSON (formato EJSON, que conserva
// ObjectId y fechas tal cual) en migration/backup/<fecha>/. Solo lee: no modifica nada en Mongo.
// Uso: node migration/backup-mongo.js
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(import.meta.dirname, 'backup', stamp);

await mongoose.connect(process.env.MONGODB_URI);
fs.mkdirSync(dir, { recursive: true });

const collections = await mongoose.connection.db.listCollections().toArray();
for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
  const docs = await mongoose.connection.db.collection(name).find().toArray();
  fs.writeFileSync(path.join(dir, `${name}.json`), EJSON.stringify(docs, null, 2, { relaxed: false }));
  console.log(`${name}: ${docs.length}`);
}

await mongoose.disconnect();
console.log(`Respaldo en ${dir}`);
