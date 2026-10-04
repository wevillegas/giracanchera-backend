import { Router } from 'express';
import { getPublicStats, getAdminStats } from '../controllers/statsController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';

const router = Router();

// Público: no requiere sesión, solo muestra datos agregados
router.get('/public', getPublicStats);

// Solo admin: datos de operación y actividad
router.get('/admin', protect, adminOnly, getAdminStats);

export default router;
