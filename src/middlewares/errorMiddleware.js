export const notFound = (req, res, next) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.originalUrl}` });
};

// Errores de Prisma que son culpa del pedido (dato repetido, id o tipo inválido, referencia inexistente), no del servidor
const DUPLICATE = 'P2002';
const CLIENT_INPUT = ['P2003', 'P2006', 'P2007', 'P2009', 'P2023', 'P2025'];

export const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  // Errores con status propio (validaciones) muestran su mensaje; los 500 no exponen detalles internos
  const isDuplicate = err.code === DUPLICATE;
  const isInputError = isDuplicate || CLIENT_INPUT.includes(err.code) || err.name === 'PrismaClientValidationError';
  const statusCode = err.status || err.statusCode || (isInputError ? 400 : 500);
  const isServerError = statusCode >= 500;
  const message = isServerError && process.env.NODE_ENV !== 'development'
    ? 'Error interno del servidor'
    : isDuplicate ? 'Ese email o usuario ya está en uso'
      : isInputError ? 'Datos inválidos' : err.message || 'Error interno del servidor';
  res.status(statusCode).json({
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
