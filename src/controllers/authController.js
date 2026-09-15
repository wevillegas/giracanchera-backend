import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

export const register = async (req, res, next) => {
  try {
    const { nombre, username, email, password, fechaNacimiento, clubHincha } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
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

    res.status(201).json({
      user,
      token: generateToken(user._id),
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

    const user = await User.findOne(email ? { email } : { username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    await user.populate('clubHincha', 'name logoUrl');

    res.json({
      user,
      token: generateToken(user._id),
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('clubHincha')
      .populate('friends', 'username avatarUrl')
      .populate('wantToVisit', 'name location');

    res.json(user);
  } catch (error) {
    next(error);
  }
};
