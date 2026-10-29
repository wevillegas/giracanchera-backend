import { isText, isNumberInRange, isCloudinaryUrl } from './validation.js';

// Campos opcionales de la ficha del estadio (apodo, historia, fotos, etc.)
export const FICHA_FIELDS = ['nickname', 'openedYear', 'surface', 'pitch', 'status', 'history', 'funFacts', 'otherUses', 'photos'];
export const SURFACES = ['natural', 'sintetico', 'hibrido'];
export const STATUSES = ['activo', 'en_obra', 'demolido'];
export const MAX_PHOTOS = 4;

const isEmpty = (value) => value === undefined || value === null || value === '';
const isIntInRange = (value, min, max) => Number.isInteger(Number(value)) && isNumberInRange(Number(value), min, max);
const isTextList = (value, maxItems, maxLength) => Array.isArray(value) && value.length <= maxItems
  && value.every((item) => isText(item) && item.trim().length > 0 && item.length <= maxLength);

// Valida solo los campos de la ficha que llegan; devuelve un mensaje de error o null
export function checkFichaInput(body) {
  const { nickname, openedYear, surface, pitch, status, history, funFacts, otherUses, photos } = body;

  if (nickname !== undefined && (!isText(nickname) || nickname.length > 80)) return 'El apodo no es válido (máximo 80 caracteres)';
  if (!isEmpty(openedYear) && !isIntInRange(openedYear, 1800, new Date().getFullYear() + 5)) return 'El año de inauguración no es válido';
  if (surface !== undefined && surface !== '' && !SURFACES.includes(surface)) return 'La superficie no es válida';
  if (status !== undefined && status !== '' && !STATUSES.includes(status)) return 'El estado del estadio no es válido';
  if (history !== undefined && (!isText(history) || history.length > 5000)) return 'La historia es demasiado larga (máximo 5000 caracteres)';

  if (pitch !== undefined) {
    if (!pitch || typeof pitch !== 'object' || Array.isArray(pitch)) return 'Las medidas de la cancha no son válidas';
    if (!isEmpty(pitch.length) && !isNumberInRange(Number(pitch.length), 50, 150)) return 'El largo de la cancha debe estar entre 50 y 150 m';
    if (!isEmpty(pitch.width) && !isNumberInRange(Number(pitch.width), 30, 100)) return 'El ancho de la cancha debe estar entre 30 y 100 m';
  }

  if (funFacts !== undefined && !isTextList(funFacts, 10, 300)) return 'Los datos curiosos deben ser hasta 10 textos de 300 caracteres';
  if (otherUses !== undefined && !isTextList(otherUses, 10, 100)) return 'Los otros usos deben ser hasta 10 textos de 100 caracteres';

  if (photos !== undefined) {
    if (!Array.isArray(photos) || photos.length > MAX_PHOTOS) return `Se permiten hasta ${MAX_PHOTOS} fotos`;
    for (const photo of photos) {
      if (!photo || typeof photo !== 'object' || !isCloudinaryUrl(photo.url)) return 'Las fotos deben ser URLs de Cloudinary';
      if (photo.credit !== undefined && (!isText(photo.credit) || photo.credit.length > 100)) return 'El crédito de la foto no es válido (máximo 100 caracteres)';
    }
  }
  return null;
}

// Con fotos, la primera es la portada y manda sobre imageUrl (así el mapa y las listas no cambian)
export function syncCover(fields) {
  return Array.isArray(fields.photos) ? { ...fields, imageUrl: fields.photos[0]?.url || '' } : fields;
}

// Fotos que ya no se usan tras un cambio, para borrarlas de Cloudinary
export function removedPhotoUrls(oldStadium, newFields) {
  if (!Array.isArray(newFields.photos)) return [];
  const kept = new Set(newFields.photos.map((photo) => photo.url));
  const before = [...oldStadium.photos.map((photo) => photo.url), oldStadium.imageUrl];
  return [...new Set(before.filter((url) => url && !kept.has(url)))];
}
