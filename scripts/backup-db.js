// Respaldo completo de la base de producción (Neon) en un archivo, con pg_dump dentro de Docker (misma versión que Neon).
// La conexión sale de la herramienta de Neon (sesión iniciada con `npx neon@latest login`), así la contraseña no queda en
// ningún archivo. También se puede pasar en BACKUP_DATABASE_URL (cadena directa, sin -pooler).
// Uso: npm run backup:db   → backups/giracanchera-AAAA-MM-DD-HHMM.dump
// Restaurar: ver el README (siempre en una rama nueva de Neon, nunca directo sobre production).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PROJECT_ID = 'old-shadow-32588091';
const PG_IMAGE = 'postgres:18-alpine'; // pg_dump tiene que ser igual o más nuevo que el Postgres de Neon (18)

const url = process.env.BACKUP_DATABASE_URL
  || execSync(`npx -y neon@latest connection-string production --project-id ${PROJECT_ID}`, { encoding: 'utf8' }).trim().split('\n').at(-1);
if (!url.startsWith('postgres') || url.includes('-pooler')) {
  console.error('No se pudo obtener la cadena directa de production (¿sesión de Neon iniciada? npx neon@latest login)');
  process.exit(1);
}

const dir = path.join(import.meta.dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const file = path.join(dir, `giracanchera-${stamp}.dump`);

// Formato "custom" de pg_dump: comprimido y se restaura con pg_restore
const dump = spawn('docker', ['run', '--rm', '-i', PG_IMAGE, 'pg_dump', '--format=custom', '--no-owner', '--no-privileges', url]);
const out = fs.createWriteStream(file);
dump.stdout.pipe(out);
let errors = '';
dump.stderr.on('data', (chunk) => { errors += chunk; });
dump.on('close', (code) => {
  out.close(() => {
    const size = fs.statSync(file).size;
    if (code !== 0 || size === 0) {
      fs.rmSync(file, { force: true });
      console.error(`Falló el respaldo (código ${code}):\n${errors.replace(/:\/\/[^@]+@/g, '://***@')}`);
      process.exit(1);
    }
    console.log(`Respaldo listo: ${file} (${(size / 1024).toFixed(0)} KB)`);
    console.log('Guardá una copia fuera de la PC (Drive, pendrive): tiene datos personales de los usuarios.');
  });
});
