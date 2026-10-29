// Importación desde Wikidata: guarda sugerencias como borrador (wikidataDraft) para que un admin las revise.
// Nunca toca los campos ya cargados. La usan el script de consola y el botón del panel de admin.
import Stadium from '../models/Stadium.js';
import { buildDraft, pickCandidate, spanishWikiTitle } from './wikidata.js';

const PAUSE_MS = 400; // cortesía con la API pública
const API = 'https://www.wikidata.org/w/api.php';
const HEADERS = { 'User-Agent': 'GiraCancheraImport/1.0 (importacion de estadios)' };

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

// Recorre los estadios sin sugerencia pendiente. `onProgress({ done, total, saved })` se llama tras cada uno;
// `onStadium(stadium, draft | null, error | null)` permite mostrar el detalle (el script lo usa para imprimir).
export async function importDrafts({ dry = false, onProgress, onStadium } = {}) {
  const stadiums = (await Stadium.find().select('+wikidataDraft')).filter((s) => !s.wikidataDraft);
  let saved = 0;
  let failed = 0;
  let done = 0;
  for (const stadium of stadiums) {
    try {
      const entity = await findEntity(stadium);
      const draft = entity && buildDraft(stadium, entity, await spanishSummary(entity));
      onStadium?.(stadium, draft, null);
      if (draft && !dry) {
        await Stadium.updateOne({ _id: stadium._id }, { wikidataDraft: draft });
        saved += 1;
      }
    } catch (error) {
      failed += 1;
      onStadium?.(stadium, null, error);
    }
    done += 1;
    onProgress?.({ done, total: stadiums.length, saved, failed });
    await pause();
  }
  return { total: stadiums.length, saved, failed };
}
