import AuditLog from '../models/AuditLog.js';

const PAGE_SIZE = 5;
const ENTITIES = ['stadium', 'club', 'user', 'visit', 'report'];

// Solo admin: lista de cambios, más recientes primero. El filtro se valida contra una lista fija
// para no pasar un objeto de la query directo a Mongo.
export const getAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = ENTITIES.includes(req.query.entity) ? { entity: req.query.entity } : {};

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, pageSize: PAGE_SIZE });
  } catch (error) {
    next(error);
  }
};
