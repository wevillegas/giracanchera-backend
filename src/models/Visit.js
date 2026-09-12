import mongoose from 'mongoose';

const visitSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    stadium: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stadium',
      required: true,
    },
    visitDate: { type: Date, required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    reviewText: { type: String, default: '' },
    images: [{ type: String }],
    matchDetails: {
      homeTeam: { type: String, default: '' },
      awayTeam: { type: String, default: '' },
      score: { type: String, default: '' },
    },
    expenses: {
      ticket: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
      food: { type: Number, default: 0 },
      currency: { type: String, default: 'ARS' },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Visit', visitSchema);
