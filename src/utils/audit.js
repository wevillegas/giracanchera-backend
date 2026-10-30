import prisma from '../config/prisma.js';

// Los registros de auditoría se borran solos a los 180 días (en Mongo lo hacía un índice TTL)
export const AUDIT_RETENTION_DAYS = 180;

// Registra un cambio en el panel de auditoría. No se espera el guardado ni se frena la operación
// original si falla: un error de auditoría solo se loguea en consola.
export function logAudit(actor, { action, entity, entityId = '', summary, fields = [], changes = [] }) {
  const data = {
    actorId: actor?._id ?? actor?.id ?? null,
    actorUsername: actor?.username ?? '',
    action,
    entity,
    entityId: String(entityId),
    summary,
    fields,
    changes,
  };
  prisma.auditLog.create({ data })
    // El autor ya no existe (ej.: borró su propia cuenta): queda registrado por su nombre, sin el vínculo
    .catch((error) => (error.code === 'P2003' ? prisma.auditLog.create({ data: { ...data, actorId: null } }) : Promise.reject(error)))
    .catch((error) => console.error('No se pudo guardar la auditoría:', error.message));
}

// Borra lo que tenga más de AUDIT_RETENTION_DAYS días. Corre al iniciar el servidor y una vez por día.
export async function purgeOldAuditLogs() {
  const limit = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: limit } } });
  return count;
}

// Antes y después de los campos que cambian en una edición (texto corto, sin contraseñas ni datos pesados).
// `before` es el documento previo; `updates`, lo que se va a guardar.
const SKIP_FIELDS = ['$inc', 'password', 'wikidataDraft'];
const shortText = (value) => {
  const text = value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
};
export function diffChanges(before, updates) {
  const plain = before || {};
  return Object.entries(updates || {})
    .filter(([field]) => !SKIP_FIELDS.includes(field))
    .map(([field, after]) => ({ field, before: shortText(plain[field]), after: shortText(after) }))
    .filter((change) => change.before !== change.after)
    .slice(0, 12);
}
