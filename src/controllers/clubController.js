import { textWithin } from '../utils/validation.js';
import Club from '../models/Club.js';
import Stadium from '../models/Stadium.js';
import User from '../models/User.js';
import { logAudit, diffChanges } from '../utils/audit.js';
import { destroyImages } from './visitController.js';

export const getClubs = async (req, res, next) => {
  try {
    const clubs = await Club.find().sort({ name: 1 });
    res.json(clubs);
  } catch (error) {
    next(error);
  }
};

export const listClubs = async (req, res, next) => {
  try {
    const clubs = await Club.find().select('name logoUrl').sort({ name: 1 });
    res.json(clubs);
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
    const payload = { name, location };

    if (req.file) {
      payload.logoUrl = req.file.path;
    }

    const club = await Club.create(payload);
    logAudit(req.user, { action: 'create', entity: 'club', entityId: club._id, summary: `Creó el club ${club.name}` });
    res.status(201).json(club);
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

    const previous = req.file ? await Club.findById(req.params.id).select('logoUrl') : null;
    const before = await Club.findById(req.params.id).select('name location logoUrl');
    const club = await Club.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!club) {
      if (req.file) await destroyImages([req.file.path]);
      return res.status(404).json({ message: 'Club no encontrado' });
    }
    if (previous?.logoUrl) await destroyImages([previous.logoUrl]);

    logAudit(req.user, { action: 'update', entity: 'club', entityId: club._id, summary: `Editó el club ${club.name}`, fields: Object.keys(updates), changes: diffChanges(before, updates) });
    res.json(club);
  } catch (error) {
    next(error);
  }
};

export const deleteClub = async (req, res, next) => {
  try {
    const { id } = req.params;
    const club = await Club.findByIdAndDelete(id);

    if (!club) {
      return res.status(404).json({ message: 'Club no encontrado' });
    }

    if (club.logoUrl) await destroyImages([club.logoUrl]);
    await Stadium.updateMany({ mainClub: id }, { mainClub: null });
    await User.updateMany({ clubHincha: id }, { clubHincha: null });

    logAudit(req.user, { action: 'delete', entity: 'club', entityId: id, summary: `Eliminó el club ${club.name}` });
    res.json({ message: 'Club eliminado' });
  } catch (error) {
    next(error);
  }
};
