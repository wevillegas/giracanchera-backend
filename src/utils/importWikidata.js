// Importación desde Wikidata por consola. Uso: npm run import:wikidata [-- --dry]  (--dry solo muestra, no guarda)
// Desde el panel de admin el botón "Buscar en Wikidata" hace lo mismo.
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { importDrafts } from './wikidataImport.js';

const DRY = process.argv.includes('--dry');

await connectDB();
const { saved } = await importDrafts({
  dry: DRY,
  onStadium: (stadium, draft, error) => {
    if (error) return console.error(`✖ ${stadium.name}: ${error.message}`);
    console.log(`${draft ? '✔' : '·'} ${stadium.name}${draft ? '' : ' (sin datos nuevos o no encontrado)'}`);
    if (draft) {
      for (const [key, value] of Object.entries(draft)) {
        if (key !== 'importedAt') console.log(`    ${key}: ${String(value).slice(0, 90)}`);
      }
    }
  },
});
console.log(DRY ? 'Simulación: no se guardó nada.' : `Borradores guardados: ${saved}`);
await mongoose.disconnect();
