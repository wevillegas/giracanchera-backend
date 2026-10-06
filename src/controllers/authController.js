import {
  isText, textWithin, isEmailFormat, isUsernameFormat, isDateValue,
} from '../utils/validation.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { logAudit } from '../utils/audit.js';

const generateToken = (user) => {
  return jwt.sign({ id: user._id, v: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

export const register = async (req, res, next) => {
  try {
    const { nombre, username, email, password, fechaNacimiento, clubHincha } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }
    // Solo texto: un objeto en email o username permitiría inyectar operadores de Mongo
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
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: 'La contraseña debe tener entre 8 y 128 caracteres' });
    }
    if (nombre !== undefined && !textWithin(nombre, 80)) {
      return res.status(400).json({ message: 'El nombre no puede tener más de 80 caracteres' });
    }
    if (fechaNacimiento !== undefined && !isDateValue(fechaNacimiento)) {
      return res.status(400).json({ message: 'La fecha de nacimiento no es válida' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'El usuario o email ya está registrado' });
    }

    const user = await User.create({
      nombre,
      username,
      email,
      password,
      fechaNacimiento,
      clubHincha,
    });
    await user.populate('clubHincha', 'name logoUrl');

    logAudit(user, { action: 'create', entity: 'user', entityId: user._id, summary: `Se registró @${user.username}` });
    res.status(201).json({
      user,
      token: generateToken(user),
    });
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

    const user = await User.findOne(email ? { email } : { username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    await user.populate('clubHincha', 'name logoUrl');

    res.json({
      user,
      token: generateToken(user),
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('clubHincha')
      .populate('following', 'username avatarUrl')
      .populate('wantToVisit', 'name location');

    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    res.json({ message: 'Sesión cerrada' });
  } catch (error) {
    next(error);
  }
};
