import mongoose from 'mongoose';

const clubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    shortName: { type: String, trim: true },
    logoUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Club', clubSchema);
