import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import connectDB from '../config/db.js';
import User from '../models/User.js';

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

    const existing = await User.findOne({ $or: [{ email: SUPERADMIN_EMAIL }, { username: SUPERADMIN_USERNAME }] });
    if (existing) {
      existing.rol = 'superadmin';
      await existing.save();
      console.log(`@${existing.username} ahora es superadmin.`);
    } else {
      if (!SUPERADMIN_PASSWORD) throw new Error('Falta SUPERADMIN_PASSWORD para crear el usuario');
      const user = await User.create({
        nombre: SUPERADMIN_NOMBRE,
        username: SUPERADMIN_USERNAME,
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD,
        rol: 'superadmin',
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
