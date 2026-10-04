import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No autorizado, token no provisto' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'No autorizado, usuario no encontrado' });
    }
    // Token emitido antes de cerrar sesión (o de un cambio de versión): ya no vale
    if ((decoded.v ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: 'No autorizado, la sesión expiró' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'No autorizado, token inválido' });
  }
};

// Para rutas públicas que cambian según quién mira: si hay sesión válida, deja req.user; si no, sigue sin usuario
export const optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (user && (decoded.v ?? 0) === (user.tokenVersion ?? 0)) req.user = user;
  } catch {
    // Token inválido o vencido: se trata como visitante
  }
  next();
};

export const adminOnly = (req, res, next) => {
  if (req.user && req.user.rol === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Acceso restringido a administradores' });
};
