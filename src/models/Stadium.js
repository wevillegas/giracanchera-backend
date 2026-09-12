import mongoose from 'mongoose';

const stadiumSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true },
    location: {
      city: { type: String, required: true },
      province: { type: String, required: true },
      country: { type: String, required: true },
      coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
    },
    mainClub: { type: mongoose.Schema.Types.ObjectId, ref: 'Club' },
    imageUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Stadium', stadiumSchema);
