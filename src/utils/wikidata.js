// Lectura de datos de Wikidata y armado del borrador de un estadio. Sin red: el script le pasa las respuestas.

const MAX_DISTANCE_KM = 3; // un candidato tiene que estar a esta distancia del estadio cargado para considerarlo el mismo
const MAX_HISTORY = 1000; // igual que el límite de la ficha

const toRad = (deg) => (deg * Math.PI) / 180;
export function distanceKm(a, b) {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const values = (entity, property) => (entity.claims?.[property] || [])
  .map((claim) => claim.mainsnak?.datavalue?.value)
  .filter((value) => value !== undefined);

// Coordenadas { lat, lng } de la entidad, o null
export function entityCoords(entity) {
  const [point] = values(entity, 'P625');
  return point ? { lat: point.latitude, lng: point.longitude } : null;
}

// De los candidatos, el más cercano al estadio cargado y a menos de MAX_DISTANCE_KM; si no hay, null
export function pickCandidate(stadium, entities) {
  const here = stadium.location?.coordinates;
  if (!here) return null;
  const near = entities
    .map((entity) => ({ entity, coords: entityCoords(entity) }))
    .filter(({ coords }) => coords)
    .map(({ entity, coords }) => ({ entity, km: distanceKm(here, coords) }))
    .filter(({ km }) => km <= MAX_DISTANCE_KM)
    .sort((a, b) => a.km - b.km);
  return near[0]?.entity ?? null;
}

const yearOf = (time) => Number(/^[+-]?(\d{1,4})-/.exec(time)?.[1]);

// Borrador con lo que Wikidata sabe y el estadio todavía no tiene (nunca pisa lo cargado).
// `summary` es el texto de la Wikipedia en español, si la entidad tiene página.
export function buildDraft(stadium, entity, summary = '', now = new Date()) {
  const draft = {};

  const nicknames = values(entity, 'P1449');
  const nickname = (nicknames.find((n) => n.language === 'es') || nicknames[0])?.text;
  if (nickname && !stadium.nickname) draft.nickname = nickname.slice(0, 80);

  const opened = yearOf(values(entity, 'P571')[0]?.time);
  if (opened >= 1800 && opened <= now.getFullYear() && !stadium.openedYear) draft.openedYear = opened;

  const closed = yearOf(values(entity, 'P576')[0]?.time);
  if (closed && closed <= now.getFullYear() && !stadium.status) draft.status = 'demolido';

  if (summary && !stadium.history) draft.history = summary.slice(0, MAX_HISTORY);

  return Object.keys(draft).length ? { ...draft, wikidataId: entity.id, importedAt: now } : null;
}

export const spanishWikiTitle = (entity) => entity.sitelinks?.eswiki?.title ?? null;
