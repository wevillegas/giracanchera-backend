import AuditLog from '../models/AuditLog.js';

// Registra un cambio en el panel de auditoría. No se espera el guardado ni se frena la operación
// original si falla: un error de auditoría solo se loguea en consola.
// ponytail: guarda nombres de campos, no valores antes/después; agregar 'changes' si hace falta ver el detalle.
export function logAudit(actor, { action, entity, entityId = '', summary, fields = [] }) {
  AuditLog.create({
    actor: actor?._id,
    actorUsername: actor?.username ?? '',
    action,
    entity,
    entityId: String(entityId),
    summary,
    fields,
  }).catch((error) => console.error('No se pudo guardar la auditoría:', error.message));
}
