import { textWithin, isId } from '../utils/validation.js';
import prisma from '../config/prisma.js';
import { logAudit, diffChanges } from '../utils/audit.js';
import { destroyImages } from './visitController.js';
import { clubJson, byText } from '../db/serialize.js';

export const getClubs = async (req, res, next) => {
  try {
    const clubs = await prisma.club.findMany();
    res.json(clubs.sort(byText('name')).map(clubJson));
  } catch (error) {
    next(error);
  }
};

export const listClubs = async (req, res, next) => {
  try {
    const clubs = await prisma.club.findMany({ select: { id: true, name: true, logoUrl: true } });
    res.json(clubs.sort(byText('name')).map((c) => ({ _id: c.id, name: c.name, logoUrl: c.logoUrl })));
  } catch (error) {
    next(error);
  }
};

// Largos máximos de los datos de un club (solo los que llegan)
function checkClubInput({ name, location }) {
  if (name !== undefined && (!textWithin(name, 120) || !name.trim())) return 'El nombre del club no es válido';
  if (location !== undefined && !textWithin(location, 100)) return 'La ubicación del club no puede tener más de 100 caracteres';
  return null;
}

export const createClub = async (req, res, next) => {
  try {
    const { name, location } = req.body;
    const inputError = checkClubInput(req.body);
    if (inputError) return res.status(400).json({ message: inputError });
    if (name === undefined) return res.status(400).json({ message: 'El nombre del club no es válido' });

    const club = await prisma.club.create({
      data: { name, location: location ?? '', ...(req.file && { logoUrl: req.file.path }) },
    });
    logAudit(req.user, { action: 'create', entity: 'club', entityId: club.id, summary: `Creó el club ${club.name}` });
    res.status(201).json(clubJson(club));
  } catch (error) {
    next(error);
  }
};

export const updateClub = async (req, res, next) => {
  try {
    const { name, location } = req.body;
    const inputError = checkClubInput(req.body);
    if (inputError) return res.status(400).json({ message: inputError });
    const updates = {};

    if (name !== undefined) updates.name = name.trim();
    if (location !== undefined) updates.location = location.trim();
    if (req.file) {
      updates.logoUrl = req.file.path;
    }

    const before = isId(req.params.id)
      ? await prisma.club.findUnique({ where: { id: req.params.id }, select: { name: true, location: true, logoUrl: true } })
      : null;
    if (!before) {
      if (req.file) await destroyImages([req.file.path]);
      return res.status(404).json({ message: 'Club no encontrado' });
    }
    const club = await prisma.club.update({ where: { id: req.params.id }, data: updates });
    if (req.file && before.logoUrl) await destroyImages([before.logoUrl]);

    logAudit(req.user, { action: 'update', entity: 'club', entityId: club.id, summary: `Editó el club ${club.name}`, fields: Object.keys(updates), changes: diffChanges(before, updates) });
    res.json(clubJson(club));
  } catch (error) {
    next(error);
  }
};

export const deleteClub = async (req, res, next) => {
  try {
    const { id } = req.params;
    const club = isId(id) ? await prisma.club.findUnique({ where: { id } }) : null;
    if (!club) {
      return res.status(404).json({ message: 'Club no encontrado' });
    }

    // Sus estadios quedan sin dueño y sus hinchas sin club (lo hace la base: ON DELETE SET NULL)
    await prisma.club.delete({ where: { id } });
    if (club.logoUrl) await destroyImages([club.logoUrl]);

    logAudit(req.user, { action: 'delete', entity: 'club', entityId: id, summary: `Eliminó el club ${club.name}` });
    res.json({ message: 'Club eliminado' });
  } catch (error) {
    next(error);
  }
};
