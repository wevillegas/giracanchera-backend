import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import connectDB from '../config/db.js';
import prisma from '../config/prisma.js';
import { hashPassword, normalizeLogin } from '../controllers/userController.js';

// Crea el superadministrador, o le asigna el rol si el usuario ya existe. No borra nada.
// Uso (variables de entorno, así la contraseña no queda en el código):
//   SUPERADMIN_EMAIL=... SUPERADMIN_USERNAME=... SUPERADMIN_PASSWORD=... node src/utils/createSuperAdmin.js
const { SUPERADMIN_EMAIL, SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD, SUPERADMIN_NOMBRE = 'Superadmin' } = process.env;

const run = async () => {
  try {
    if (!SUPERADMIN_EMAIL || !SUPERADMIN_USERNAME) {
      throw new Error('Faltan SUPERADMIN_EMAIL y SUPERADMIN_USERNAME');
    }
    await connectDB();

    const email = normalizeLogin(SUPERADMIN_EMAIL);
    const username = normalizeLogin(SUPERADMIN_USERNAME);
    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { rol: 'superadmin' } });
      console.log(`@${existing.username} ahora es superadmin.`);
    } else {
      if (!SUPERADMIN_PASSWORD) throw new Error('Falta SUPERADMIN_PASSWORD para crear el usuario');
      const user = await prisma.user.create({
        data: { nombre: SUPERADMIN_NOMBRE, username, email, password: await hashPassword(SUPERADMIN_PASSWORD), rol: 'superadmin' },
      });
      console.log(`Superadmin creado: @${user.username}`);
    }
    process.exit(0);
  } catch (error) {
    console.error('Error al crear el superadmin:', error.message);
    process.exit(1);
  }
};

run();
