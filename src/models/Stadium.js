import mongoose from 'mongoose';

const stadiumSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true },
    location: {
      city: { type: String, required: true },
      province: { type: String, default: '' }, // vacío en ciudades sin provincia (ej: CABA)
      country: { type: String, required: true },
      coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
    },
    // 'club': lo posee mainClub (o nadie, si mainClub está vacío); 'province': propiedad de la provincia
    ownerType: { type: String, enum: ['club', 'province'], default: 'club' },
    mainClub: { type: mongoose.Schema.Types.ObjectId, ref: 'Club' },
    imageUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Stadium', stadiumSchema);
