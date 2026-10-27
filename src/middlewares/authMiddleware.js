import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const COOKIE_NAME = 'gc_token';

// El token llega por la cookie httpOnly de la web, o por Authorization: Bearer (Postman, scripts)
function tokenFrom(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.split(' ')[1];
  const pair = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return pair ? decodeURIComponent(pair.slice(COOKIE_NAME.length + 1)) : null;
}

export const protect = async (req, res, next) => {
  try {
    const token = tokenFrom(req);
    if (!token) {
      return res.status(401).json({ message: 'No autorizado, token no provisto' });
    }

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
  const token = tokenFrom(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (user && (decoded.v ?? 0) === (user.tokenVersion ?? 0)) req.user = user;
  } catch {
    // Token inválido o vencido: se trata como visitante
  }
  next();
};

// Roles: 'user' < 'admin' < 'superadmin'. El superadmin hereda todo lo del admin.
export const adminOnly = (req, res, next) => {
  if (req.user && ['admin', 'superadmin'].includes(req.user.rol)) {
    return next();
  }
  return res.status(403).json({ message: 'Acceso restringido a administradores' });
};

export const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.rol === 'superadmin') {
    return next();
  }
  return res.status(403).json({ message: 'Acceso restringido al superadministrador' });
};
