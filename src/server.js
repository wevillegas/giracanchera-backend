// Debe ser el primer import: en ESM, Node evalúa todas las dependencias
// importadas (app.js -> rutas -> config/cloudinary.js, que lee process.env
// al cargarse) antes de correr el resto del código de este archivo. Si
// dotenv.config() se llama como una instrucción normal más abajo, corre
// demasiado tarde y Cloudinary queda configurado con variables undefined.
import 'dotenv/config';
// Sentry se inicia antes de cargar la app (después de dotenv, que trae SENTRY_DSN)
import './config/sentry.js';

import app from './app.js';
import connectDB, { disconnectDB } from './config/db.js';
import { purgeOldAuditLogs } from './utils/audit.js';

const PORT = process.env.PORT || 5000;

// Un secreto corto o ausente deja las sesiones expuestas a fuerza bruta: en producción no se arranca así
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  const problem = 'JWT_SECRET debe tener al menos 32 caracteres (usá 64 bytes aleatorios en hex)';
  if (!secret || process.env.NODE_ENV === 'production') {
    console.error(problem);
    process.exit(1);
  }
  console.warn(`Aviso: ${problem}`);
}

const startServer = async () => {
  await connectDB();

  // Auditoría: se borra lo que tenga más de 180 días, al iniciar y después una vez por día
  const purgeAudit = () => purgeOldAuditLogs()
    .then((count) => { if (count) console.log(`Auditoría: ${count} registros de más de 180 días borrados`); })
    .catch((error) => console.error('No se pudo limpiar la auditoría:', error.message));
  purgeAudit();
  setInterval(purgeAudit, 24 * 60 * 60 * 1000).unref();

  const server = app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });

  // Apagado ordenado: termina los requests en curso y cierra la base antes de salir
  const shutdown = (signal) => {
    console.log(`${signal} recibido, cerrando...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
