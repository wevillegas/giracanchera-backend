import mongoose from 'mongoose';

const clubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    logoUrl: { type: String, default: '' },
    location: { type: String, trim: true, default: '' },
    stadium: { type: mongoose.Schema.Types.ObjectId, ref: 'Stadium' },
  },
  { timestamps: true }
);

export default mongoose.model('Club', clubSchema);
