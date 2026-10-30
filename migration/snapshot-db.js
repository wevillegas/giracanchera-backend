// La única parte de la grabación que depende de la base: la lista de usuarios para firmar sus sesiones
// y cómo cerrar la conexión. (La grabación de Mongo, la "fotografía" de antes de migrar, ya quedó guardada.)
import prisma from '../src/config/prisma.js';

export const loadUsers = () => prisma.user.findMany({
  select: { id: true, username: true, rol: true, tokenVersion: true },
  orderBy: { username: 'asc' },
});

export const closeDB = () => prisma.$disconnect();
