import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorUsername: { type: String, default: '' },
    action: { type: String, enum: ['create', 'update', 'delete', 'resolve'], required: true },
    entity: { type: String, enum: ['stadium', 'club', 'user', 'visit', 'report'], required: true },
    entityId: { type: String, default: '' },
    summary: { type: String, required: true },
    fields: { type: [String], default: [] }, // nombres de los campos modificados, sin valores
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
