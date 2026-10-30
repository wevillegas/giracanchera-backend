import prisma from './prisma.js';

const ATTEMPTS = 5;
const WAIT_MS = 3000;

// Reintenta unas veces antes de rendirse: en un deploy la base puede tardar en estar lista (Neon se "despierta")
const connectDB = async () => {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(`PostgreSQL conectado: ${new URL(process.env.DATABASE_URL).host}`);
      return;
    } catch (error) {
      console.error(`Error al conectar a PostgreSQL (${attempt}/${ATTEMPTS}): ${error.message}`);
      if (attempt === ATTEMPTS) process.exit(1);
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    }
  }
};

export const disconnectDB = () => prisma.$disconnect();

export default connectDB;
