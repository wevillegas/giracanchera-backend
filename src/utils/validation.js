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
