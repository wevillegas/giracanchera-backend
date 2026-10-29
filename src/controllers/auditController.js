import AuditLog from '../models/AuditLog.js';

const PAGE_SIZE = 20;
const EXPORT_LIMIT = 5000;
const ENTITIES = ['stadium', 'club', 'user', 'visit', 'report', 'suggestion'];
const ACTIONS = ['create', 'update', 'delete', 'resolve'];
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// Arma el filtro solo con valores validados (listas fijas, fechas AAAA-MM-DD, texto como cadena) para no pasar
// objetos de la query directo a Mongo.
function filterFrom(query) {
  const filter = {};
  if (ENTITIES.includes(query.entity)) filter.entity = query.entity;
  if (ACTIONS.includes(query.action)) filter.action = query.action;
  if (typeof query.actor === 'string' && query.actor.trim()) filter.actorUsername = query.actor.trim().slice(0, 40);
  const createdAt = {};
  if (DATE_RX.test(query.from)) createdAt.$gte = new Date(`${query.from}T00:00:00.000-03:00`);
  if (DATE_RX.test(query.to)) createdAt.$lte = new Date(`${query.to}T23:59:59.999-03:00`);
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;
  return filter;
}

// Solo admin: lista de cambios, más recientes primero
export const getAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = filterFrom(req.query);

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

// Quiénes hicieron cambios, para el filtro por administrador
export const getAuditActors = async (req, res, next) => {
  try {
    const actors = await AuditLog.distinct('actorUsername');
    res.json(actors.filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')));
  } catch (error) {
    next(error);
  }
};

const csvCell = (value) => {
  // Evita que Excel ejecute fórmulas si un texto empieza con = + - @
  const text = String(value ?? '').replace(/^([=+\-@])/, "'$1").replace(/"/g, '""');
  return `"${text}"`;
};

// CSV con los mismos filtros que la lista (hasta EXPORT_LIMIT filas)
export const exportAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find(filterFrom(req.query)).sort({ createdAt: -1 }).limit(EXPORT_LIMIT);
    const header = ['Fecha', 'Administrador', 'Acción', 'Entidad', 'Resumen', 'Campos', 'Cambios'];
    const rows = logs.map((log) => [
      log.createdAt.toISOString(),
      log.actorUsername,
      log.action,
      log.entity,
      log.summary,
      log.fields.join(', '),
      log.changes.map((c) => `${c.field}: "${c.before}" → "${c.after}"`).join(' | '),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="auditoria.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
};
