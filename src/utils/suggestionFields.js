import { isText, isNumberInRange } from './validation.js';
import { checkFichaInput } from './stadiumFicha.js';

// Datos del estadio que un usuario puede sugerir corregir. 'other' no se aplica solo: el admin lo corrige a mano.
export const SUGGESTION_FIELDS = ['nickname', 'openedYear', 'surface', 'status', 'pitchLength', 'pitchWidth', 'history', 'capacity', 'other'];

// Cuerpo parcial que checkFichaInput sabe validar para cada campo
const FICHA_BODY = {
  nickname: (v) => ({ nickname: v }),
  openedYear: (v) => ({ openedYear: v }),
  surface: (v) => ({ surface: v }),
  status: (v) => ({ status: v }),
  history: (v) => ({ history: v }),
  pitchLength: (v) => ({ pitch: { length: v } }),
  pitchWidth: (v) => ({ pitch: { width: v } }),
};

// Mensaje de error si la sugerencia no es válida, o null
export function checkSuggestion({ field, value, note }) {
  if (!SUGGESTION_FIELDS.includes(field)) return 'El dato a corregir no es válido';
  if (!isText(value) || !value.trim() || value.length > 5000) return 'Escribí la corrección (hasta 5000 caracteres)';
  if (note !== undefined && (!isText(note) || note.length > 300)) return 'El motivo debe tener hasta 300 caracteres';
  if (field === 'other') return value.length > 500 ? 'La corrección es demasiado larga (hasta 500 caracteres)' : null;
  if (field === 'capacity') {
    return Number.isInteger(Number(value)) && isNumberInRange(Number(value), 1, 200000) ? null : 'La capacidad debe ser un número entero entre 1 y 200.000';
  }
  return checkFichaInput(FICHA_BODY[field](value.trim()));
}

// Cambio de MongoDB que aplica la sugerencia al estadio; null si hay que corregirlo a mano
export function suggestionUpdate({ field, value }) {
  const text = value.trim();
  if (field === 'other') return null;
  if (field === 'pitchLength') return { 'pitch.length': Number(text) };
  if (field === 'pitchWidth') return { 'pitch.width': Number(text) };
  if (field === 'openedYear' || field === 'capacity') return { [field]: Number(text) };
  return { [field]: text };
}
