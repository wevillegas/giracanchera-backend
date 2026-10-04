export const notFound = (req, res, next) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.originalUrl}` });
};

export const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  // Errores con status propio (validaciones) muestran su mensaje; los 500 no exponen detalles internos
  // Datos mal formados que llegan a Mongoose (id inválido, tipo incorrecto) son errores del cliente
  const isMongooseInputError = err.name === 'CastError' || err.name === 'ValidationError';
  const statusCode = err.status || err.statusCode || (isMongooseInputError ? 400 : 500);
  const isServerError = statusCode >= 500;
  const message = isServerError && process.env.NODE_ENV !== 'development'
    ? 'Error interno del servidor'
    : isMongooseInputError ? 'Datos inválidos' : err.message || 'Error interno del servidor';
  res.status(statusCode).json({
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
