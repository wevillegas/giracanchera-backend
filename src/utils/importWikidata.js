// Importación única desde Wikidata: guarda sugerencias como borrador (wikidataDraft) para que un admin las revise.
// Nunca toca los campos ya cargados. Uso: npm run import:wikidata [-- --dry]  (--dry solo muestra, no guarda)
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Stadium from '../models/Stadium.js';
import { buildDraft, pickCandidate, spanishWikiTitle } from './wikidata.js';

const DRY = process.argv.includes('--dry');
const PAUSE_MS = 400; // cortesía con la API pública
const API = 'https://www.wikidata.org/w/api.php';
const HEADERS = { 'User-Agent': 'GiraCancheraImport/1.0 (importacion unica de estadios)' };

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
const getJson = async (url) => {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} en ${url}`);
  return res.json();
};

async function findEntity(stadium) {
  const search = await getJson(`${API}?action=wbsearchentities&search=${encodeURIComponent(stadium.name)}&language=es&type=item&limit=5&format=json`);
  const ids = (search.search || []).map((hit) => hit.id);
  if (!ids.length) return null;
  const data = await getJson(`${API}?action=wbgetentities&ids=${ids.join('|')}&props=claims|sitelinks&format=json`);
  return pickCandidate(stadium, Object.values(data.entities || {}));
}

async function spanishSummary(entity) {
  const title = spanishWikiTitle(entity);
  if (!title) return '';
  try {
    const page = await getJson(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    return page.extract || '';
  } catch {
    return '';
  }
}

await connectDB();
const stadiums = await Stadium.find().select('+wikidataDraft');
let saved = 0;
for (const stadium of stadiums) {
  if (stadium.wikidataDraft) continue; // ya tiene una sugerencia pendiente
  try {
    const entity = await findEntity(stadium);
    const draft = entity && buildDraft(stadium, entity, await spanishSummary(entity));
    console.log(`${draft ? '✔' : '·'} ${stadium.name}${draft ? '' : ' (sin datos nuevos o no encontrado)'}`);
    if (draft) {
      for (const [key, value] of Object.entries(draft)) {
        if (key !== 'importedAt') console.log(`    ${key}: ${String(value).slice(0, 90)}`);
      }
    }
    if (draft && !DRY) {
      await Stadium.updateOne({ _id: stadium._id }, { wikidataDraft: draft });
      saved += 1;
    }
  } catch (error) {
    console.error(`✖ ${stadium.name}: ${error.message}`);
  }
  await pause();
}
console.log(DRY ? 'Simulación: no se guardó nada.' : `Borradores guardados: ${saved}`);
await mongoose.disconnect();
