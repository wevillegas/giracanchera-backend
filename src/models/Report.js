import mongoose from 'mongoose';

// Denuncia de una reseña hecha por otro usuario; un usuario puede denunciar una misma reseña una sola vez
const reportSchema = new mongoose.Schema(
  {
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  },
  { timestamps: true }
);

reportSchema.index({ visit: 1, reporter: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Report', reportSchema);
