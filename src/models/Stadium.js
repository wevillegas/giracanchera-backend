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
    imageUrl: { type: String, default: '' }, // portada: siempre igual a photos[0].url cuando hay fotos
    // Ficha del estadio: todo opcional, los estadios existentes siguen siendo válidos
    nickname: { type: String, default: '' },
    openedYear: { type: Number },
    surface: { type: String, enum: ['', 'natural', 'sintetico', 'hibrido'], default: '' },
    pitch: { length: { type: Number }, width: { type: Number } }, // medidas de la cancha en metros
    status: { type: String, enum: ['', 'activo', 'en_obra', 'demolido'], default: '' },
    history: { type: String, default: '' },
    funFacts: { type: [String], default: [] },
    otherUses: { type: [String], default: [] }, // otros clubes, selección, recitales
    // Datos sugeridos por la importación de Wikidata: no se ven en el sitio hasta que un admin los revisa y guarda
    wikidataDraft: {
      type: new mongoose.Schema(
        {
          nickname: String, openedYear: Number, status: String, history: String, wikidataId: String, importedAt: Date,
        },
        { _id: false }
      ),
      select: false,
    },
    photos: {
      type: [{ _id: false, url: { type: String, required: true }, credit: { type: String, default: '' } }],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model('Stadium', stadiumSchema);
