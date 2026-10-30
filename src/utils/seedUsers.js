import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import connectDB from '../config/db.js';
import prisma from '../config/prisma.js';
import { hashPassword } from '../controllers/userController.js';

const usersData = [
  { nombre: 'Admin', username: 'admin', email: 'admin@giracanchera.com', password: 'admin123', rol: 'admin' },
  { nombre: 'Usuario', username: 'usuario', email: 'usuario@giracanchera.com', password: 'usuario123', rol: 'user' },
];

const seed = async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Este seed crea usuarios con contraseñas conocidas: no se puede correr en producción.');
    }
    await connectDB();

    for (const { password, ...data } of usersData) {
      await prisma.user.deleteMany({ where: { username: data.username } });
      await prisma.user.create({ data: { ...data, password: await hashPassword(password) } });
    }

    console.log('Usuarios de prueba creados: admin/admin123, usuario/usuario123');
    process.exit(0);
  } catch (error) {
    console.error('Error al ejecutar el seed de usuarios:', error.message);
    process.exit(1);
  }
};

seed();
