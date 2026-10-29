import mongoose from 'mongoose';
import { SUGGESTION_FIELDS } from '../utils/suggestionFields.js';

// Corrección de un dato del estadio propuesta por un usuario; un admin la aprueba (y se aplica) o la descarta
const suggestionSchema = new mongoose.Schema(
  {
    stadium: { type: mongoose.Schema.Types.ObjectId, ref: 'Stadium', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    field: { type: String, enum: SUGGESTION_FIELDS, required: true },
    value: { type: String, required: true, trim: true, maxlength: 5000 },
    note: { type: String, default: '', trim: true, maxlength: 300 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

// Un usuario tiene como mucho una sugerencia pendiente por dato y estadio
suggestionSchema.index(
  { stadium: 1, author: 1, field: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
suggestionSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('StadiumSuggestion', suggestionSchema);
