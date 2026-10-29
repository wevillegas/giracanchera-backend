import AuditLog from '../models/AuditLog.js';

// Registra un cambio en el panel de auditoría. No se espera el guardado ni se frena la operación
// original si falla: un error de auditoría solo se loguea en consola.
// ponytail: guarda nombres de campos, no valores antes/después; agregar 'changes' si hace falta ver el detalle.
export function logAudit(actor, { action, entity, entityId = '', summary, fields = [], changes = [] }) {
  AuditLog.create({
    actor: actor?._id,
    actorUsername: actor?.username ?? '',
    action,
    entity,
    entityId: String(entityId),
    summary,
    fields,
    changes,
  }).catch((error) => console.error('No se pudo guardar la auditoría:', error.message));
}

// Antes y después de los campos que cambian en una edición (texto corto, sin contraseñas ni datos pesados).
// `before` es el documento previo; `updates`, lo que se va a guardar.
const SKIP_FIELDS = ['$inc', 'password', 'wikidataDraft'];
const shortText = (value) => {
  const text = value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
};
export function diffChanges(before, updates) {
  const plain = before?.toObject ? before.toObject() : before || {};
  return Object.entries(updates || {})
    .filter(([field]) => !SKIP_FIELDS.includes(field))
    .map(([field, after]) => ({ field, before: shortText(plain[field]), after: shortText(after) }))
    .filter((change) => change.before !== change.after)
    .slice(0, 12);
}
