import * as Sentry from '@sentry/node';

// Avisos de errores del servidor (Sentry). Solo se activa con SENTRY_DSN (producción); en local y en los tests no hace nada.
// No manda datos personales (sendDefaultPii: false: ni IP, ni cookies, ni cuerpo de los pedidos), solo el error y dónde pasó.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0, // solo errores, sin medición de rendimiento
  });
}

export default Sentry;
