import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Configuración de Prisma (CLI: migraciones, studio). Las migraciones necesitan una conexión directa: en Neon es
// DATABASE_URL_UNPOOLED (sin -pooler); en local no hace falta y se usa DATABASE_URL. La app usa siempre DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL },
});
