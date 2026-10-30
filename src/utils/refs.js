import prisma from '../config/prisma.js';
import { isId } from './validation.js';

// Vacío (sin club) o id de un club que existe
export const isValidClubRef = async (value) => !value || (isId(value) && Boolean(await prisma.club.findUnique({ where: { id: value }, select: { id: true } })));

export const stadiumExists = async (id) => isId(id) && Boolean(await prisma.stadium.findUnique({ where: { id }, select: { id: true } }));

export const userExists = async (id) => isId(id) && Boolean(await prisma.user.findUnique({ where: { id }, select: { id: true } }));
