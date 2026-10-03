import Club from '../models/Club.js';
import Stadium from '../models/Stadium.js';
import User from '../models/User.js';

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
    const clubs = await Club.find().select('name').sort({ name: 1 });
    res.json(clubs);
  } catch (error) {
    next(error);
  }
};

export const createClub = async (req, res, next) => {
  try {
    const { name, shortName, location } = req.body;
    const payload = { name, shortName, location };

    if (req.file) {
      payload.logoUrl = req.file.path;
    }

    const club = await Club.create(payload);
    res.status(201).json(club);
  } catch (error) {
    next(error);
  }
};

export const updateClub = async (req, res, next) => {
  try {
    const { name, shortName, location } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name.trim();
    if (shortName !== undefined) updates.shortName = shortName.trim();
    if (location !== undefined) updates.location = location.trim();
    if (req.file) {
      updates.logoUrl = req.file.path;
    }

    const club = await Club.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!club) {
      return res.status(404).json({ message: 'Club no encontrado' });
    }

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

    await Stadium.updateMany({ mainClub: id }, { mainClub: null });
    await User.updateMany({ clubHincha: id }, { clubHincha: null });

    res.json({ message: 'Club eliminado' });
  } catch (error) {
    next(error);
  }
};
