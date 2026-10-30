import {
  isText, textWithin, isEmailFormat, isUsernameFormat, isDateValue, isPasswordFormat,
} from '../utils/validation.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { logAudit } from '../utils/audit.js';
import { COOKIE_NAME } from '../middlewares/authMiddleware.js';
import { isValidClubRef } from '../utils/refs.js';
import { normalizeLogin, hashPassword } from './userController.js';
import {
  accountJson, clubBadge, clubBadgeSelect, clubJson, userCard, userCardSelect, locationOf,
  followingIdsSelect, wishlistIdsSelect, savedIdsSelect, followingIds, wishlistIds, savedIds,
} from '../db/serialize.js';

// Hash de relleno: login compara siempre, exista o no el usuario, para que el tiempo no delate cuentas
const DUMMY_HASH = bcrypt.hashSync('relleno', 10);

const generateToken = (user) => {
  return jwt.sign({ id: user.id, v: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const cookieOptions = {
  httpOnly: true, // el JS de la página no puede leerla: un XSS no roba la sesión
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', // no viaja en pedidos que vienen de otros sitios (frena CSRF)
  path: '/',
};

// La sesión va en una cookie; el token no se devuelve en el cuerpo
const startSession = (res, user) => {
  res.cookie(COOKIE_NAME, generateToken(user), { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
};

// Lo que se devuelve al registrarse o iniciar sesión: la cuenta con su club y sus listas como ids
const sessionInclude = { clubHincha: { select: clubBadgeSelect }, ...followingIdsSelect, ...wishlistIdsSelect, ...savedIdsSelect };
const sessionAccount = (user) => accountJson(user, {
  clubHincha: clubBadge(user.clubHincha), following: followingIds(user), wantToVisit: wishlistIds(user), savedVisits: savedIds(user),
});

export const register = async (req, res, next) => {
  try {
    const { nombre, username, email, password, fechaNacimiento, clubHincha } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }
    // Solo texto: un objeto en email o username no es un dato válido
    const textFields = [username, email, password, nombre, clubHincha].filter((v) => v !== undefined);
    if (!textFields.every(isText)) {
      return res.status(400).json({ message: 'Datos inválidos' });
    }
    if (!isUsernameFormat(username)) {
      return res.status(400).json({ message: 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo' });
    }
    if (!isEmailFormat(email)) {
      return res.status(400).json({ message: 'El email no es válido' });
    }
    if (!isPasswordFormat(password)) {
      return res.status(400).json({ message: 'La contraseña debe tener entre 8 y 128 caracteres, con al menos una letra y un número' });
    }
    if (nombre !== undefined && !textWithin(nombre, 80)) {
      return res.status(400).json({ message: 'El nombre no puede tener más de 80 caracteres' });
    }
    if (fechaNacimiento !== undefined && !isDateValue(fechaNacimiento)) {
      return res.status(400).json({ message: 'La fecha de nacimiento no es válida' });
    }

    if (!(await isValidClubRef(clubHincha))) {
      return res.status(400).json({ message: 'El club elegido no existe' });
    }

    const login = { email: normalizeLogin(email), username: normalizeLogin(username) };
    const existingUser = await prisma.user.findFirst({ where: { OR: [{ email: login.email }, { username: login.username }] }, select: { id: true } });
    if (existingUser) {
      return res.status(400).json({ message: 'El usuario o email ya está registrado' });
    }

    const user = await prisma.user.create({
      data: {
        nombre: nombre?.trim(),
        ...login,
        password: await hashPassword(password),
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
        clubHinchaId: clubHincha || null,
      },
      omit: { password: true },
      include: sessionInclude,
    });

    logAudit(user, { action: 'create', entity: 'user', entityId: user.id, summary: `Se registró @${user.username}` });
    startSession(res, user);
    res.status(201).json({ user: sessionAccount(user) });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    if ((!email && !username) || !password) {
      return res.status(400).json({ message: 'Email/usuario y contraseña son obligatorios' });
    }
    if (![email, username, password].filter((v) => v !== undefined).every(isText)) {
      return res.status(400).json({ message: 'Datos inválidos' });
    }

    const where = email ? { email: normalizeLogin(email) } : { username: normalizeLogin(username) };
    const user = await prisma.user.findUnique({ where, include: sessionInclude });
    const passwordOk = user ? await bcrypt.compare(password, user.password) : await bcrypt.compare(password, DUMMY_HASH).then(() => false);
    if (!passwordOk) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    startSession(res, user);
    res.json({ user: sessionAccount(user) });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      omit: { password: true },
      include: {
        clubHincha: true,
        following: { orderBy: { createdAt: 'asc' }, select: { followed: { select: userCardSelect } } },
        wishlist: { orderBy: { createdAt: 'asc' }, select: { stadium: { select: { id: true, name: true, city: true, province: true, country: true, lat: true, lng: true } } } },
        ...savedIdsSelect,
      },
    });

    res.json(accountJson(user, {
      clubHincha: clubJson(user.clubHincha),
      following: user.following.map((f) => userCard(f.followed)),
      wantToVisit: user.wishlist.map(({ stadium }) => ({ _id: stadium.id, name: stadium.name, location: locationOf(stadium) })),
      savedVisits: savedIds(user),
    }));
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ message: 'Sesión cerrada' });
  } catch (error) {
    next(error);
  }
};
