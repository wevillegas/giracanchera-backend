import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

// Un solo cliente para toda la app. La cadena de conexión sale de DATABASE_URL (Docker en local, Neon en producción).
// El cliente generado es TypeScript: Node 22.18+ lo ejecuta directo, sin compilar.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export default prisma;
