import * as Sentry from '@sentry/node';

// Avisos de errores del servidor (Sentry). Solo se activa con SENTRY_DSN; en los tests (node --test) no hace nada.
// Se carga con `node --import` (ver scripts start/dev) para que Express y pg queden instrumentados antes de importarse.
// No manda datos personales (sendDefaultPii: false: ni IP, ni cookies, ni cuerpo de los pedidos), solo el error y dónde pasó.
if (process.env.SENTRY_DSN && !process.env.NODE_TEST_CONTEXT) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RENDER_GIT_COMMIT,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

export default Sentry;
