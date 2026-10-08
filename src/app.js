import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

import authRoutes from './routes/authRoutes.js';
import stadiumRoutes from './routes/stadiumRoutes.js';
import visitRoutes from './routes/visitRoutes.js';
import clubRoutes from './routes/clubRoutes.js';
import userRoutes from './routes/userRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

const app = express();

// Lista blanca de URLs permitidas para desarrollo y producción
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  process.env.FRONTEND_URL,
].filter(Boolean);

// Encabezados de seguridad. Las imágenes vienen de Cloudinary, por eso el recurso se permite cross-origin
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Detrás de un proxy (Render, Railway, etc.) el IP real llega en X-Forwarded-For
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.use(
  cors({
    origin: (origin, callback) => {
      // Sin origin (Postman, curl) o en la lista blanca; el resto no recibe encabezados CORS
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Límites por IP: login y registro son los más sensibles a fuerza bruta y spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Demasiadas solicitudes. Probá de nuevo en unos minutos.' },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/stadiums', stadiumRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/audit', auditRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;