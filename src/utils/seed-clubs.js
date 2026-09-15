// Script de migración temporal: crea documentos Club a partir del texto
// legado en Stadium y vincula ambos lados con ObjectId. Ejecutar una vez y borrar.
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Stadium from '../models/Stadium.js';
import Club from '../models/Club.js';

const run = async () => {
  await connectDB();

  // lectura cruda: el campo de texto legado ya no existe en el schema actual
  const rawStadiums = await Stadium.collection.find({}).toArray();

  let migrated = 0;
  let skipped = 0;

  for (const raw of rawStadiums) {
    const clubName = typeof raw.club === 'string' ? raw.club.trim() : null;

    if (!clubName) {
      skipped++;
      continue;
    }

    const club = await Club.findOneAndUpdate(
      { name: clubName },
      { $setOnInsert: { name: clubName } },
      { upsert: true, new: true }
    );

    await Stadium.collection.updateOne(
      { _id: raw._id },
      { $set: { mainClub: club._id }, $unset: { club: '' } }
    );

    club.stadium = raw._id;
    await club.save();

    migrated++;
  }

  console.log(`Migración completa: ${migrated} estadios vinculados, ${skipped} sin club de texto.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Error en la migración:', err);
  process.exit(1);
});
