// Helpers de validación compartidos por los controladores.

export const isText = (value) => typeof value === 'string';

// Escapa los caracteres especiales de regex para buscar el texto literal
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Error con status HTTP, para que errorHandler responda 400 en vez de 500
export const httpError = (status, message) => Object.assign(new Error(message), { status });

// Parsea un campo JSON que llega en multipart; devuelve { ok, value }
export const safeParse = (raw) => {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: undefined };
  if (typeof raw === 'object') return { ok: true, value: raw };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

export const isNumberInRange = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

// Texto no vacío (opcional) con largo máximo
export const textWithin = (value, max) => isText(value) && value.length <= max;

export const isEmailFormat = (value) => isText(value) && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Usuario: 3 a 30 caracteres, letras, números, punto, guion bajo o guion
export const isUsernameFormat = (value) => isText(value) && /^[a-zA-Z0-9_.-]{3,30}$/.test(value);

export const isDateValue = (value) => !Number.isNaN(new Date(value).getTime());

// Contraseña: 8-128 caracteres, al menos una letra y un número
export const isPasswordFormat = (value) => isText(value) && value.length >= 8 && value.length <= 128
  && /[a-zA-Z]/.test(value) && /\d/.test(value);

// Solo URLs de Cloudinary: evita que un usuario ponga un link externo como avatar
// (pixel de tracking para saber cuándo/quién mira su perfil)
export const isCloudinaryUrl = (value) => {
  if (!isText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
};
