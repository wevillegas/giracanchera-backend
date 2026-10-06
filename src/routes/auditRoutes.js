import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';

const router = Router();

// Solo admin: historial de cambios
router.get('/', protect, adminOnly, getAuditLogs);

export default router;
