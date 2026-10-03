import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import connectDB from '../config/db.js';
import User from '../models/User.js';

const usersData = [
  { nombre: 'Admin', username: 'admin', email: 'admin@giracanchera.com', password: 'admin123', rol: 'admin' },
  { nombre: 'Usuario', username: 'usuario', email: 'usuario@giracanchera.com', password: 'usuario123', rol: 'user' },
];

const seed = async () => {
  try {
    await connectDB();

    for (const data of usersData) {
      await User.deleteOne({ username: data.username });
      await User.create(data);
    }

    console.log('Usuarios de prueba creados: admin/admin123, usuario/usuario123');
    process.exit(0);
  } catch (error) {
    console.error('Error al ejecutar el seed de usuarios:', error.message);
    process.exit(1);
  }
};

seed();
