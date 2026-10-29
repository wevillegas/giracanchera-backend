import { Router } from 'express';
import { getAuditLogs, getAuditActors, exportAuditLogs } from '../controllers/auditController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';

const router = Router();

// Solo admin: historial de cambios
router.get('/', protect, adminOnly, getAuditLogs);
router.get('/actors', protect, adminOnly, getAuditActors);
router.get('/export', protect, adminOnly, exportAuditLogs);

export default router;
