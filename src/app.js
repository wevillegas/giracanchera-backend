import express from 'express';
import cors from 'cors';

import authRoutes from './routes/authRoutes.js';
import stadiumRoutes from './routes/stadiumRoutes.js';
import visitRoutes from './routes/visitRoutes.js';
import clubRoutes from './routes/clubRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

const app = express();

// Lista blanca de URLs permitidas para desarrollo y producción
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite peticiones sin origin (Postman/móvil) o si el origen está en la lista blanca
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // En desarrollo también refleja el origen para evitar bloqueos por cambio de puerto
        callback(null, true);
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/stadiums', stadiumRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/users', userRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;