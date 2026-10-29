import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorUsername: { type: String, default: '' },
    action: { type: String, enum: ['create', 'update', 'delete', 'resolve'], required: true },
    entity: { type: String, enum: ['stadium', 'club', 'user', 'visit', 'report', 'suggestion'], required: true },
    entityId: { type: String, default: '' },
    summary: { type: String, required: true },
    fields: { type: [String], default: [] }, // nombres de los campos modificados, sin valores
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Se borran solos a los 180 días. Índice ascendente: Mongo lo recorre al revés para el orden más reciente primero.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export default mongoose.model('AuditLog', auditLogSchema);
