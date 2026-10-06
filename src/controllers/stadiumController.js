import { isText, isNumberInRange } from '../utils/validation.js';
import Stadium from '../models/Stadium.js';
import Visit from '../models/Visit.js';
import User from '../models/User.js';
import { logAudit } from '../utils/audit.js';

// Valida solo los campos que llegan; devuelve un mensaje de error o null
function checkStadiumInput(body) {
  const { name, capacity, location } = body;
  if (name !== undefined && (!isText(name) || name.trim().length === 0 || name.length > 120)) {
    return 'El nombre del estadio no es válido';
  }
  if (capacity !== undefined && !(Number.isInteger(Number(capacity)) && isNumberInRange(Number(capacity), 0, 200000))) {
    return 'La capacidad debe ser un número entero entre 0 y 200.000';
  }
  if (location !== undefined) {
    if (!location || typeof location !== 'object' || Array.isArray(location)) return 'La ubicación no es válida';
    for (const key of ['city', 'province', 'country']) {
      if (location[key] !== undefined && (!isText(location[key]) || location[key].length > 100)) {
        return 'La ubicación debe ser texto';
      }
    }
    const { lat, lng } = location.coordinates || {};
    if (lat !== undefined && !isNumberInRange(Number(lat), -90, 90)) return 'La latitud debe estar entre -90 y 90';
    if (lng !== undefined && !isNumberInRange(Number(lng), -180, 180)) return 'La longitud debe estar entre -180 y 180';
  }
  return null;
}

// Solo se guardan los campos que el admin puede modificar (evita mass assignment)
const STADIUM_FIELDS = ['name', 'capacity', 'location', 'ownerType', 'mainClub', 'imageUrl'];
function pickStadiumFields(body) {
  return Object.fromEntries(STADIUM_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
}

// Un estadio de la provincia no tiene club dueño; el resto puede tener mainClub o quedar sin dueño
function ownershipFields(body) {
  if (body.ownerType === 'province') return { ...body, ownerType: 'province', mainClub: null };
  return { ...body, ownerType: 'club' };
}

export const getStadiums = async (req, res, next) => {
  try {
    const stadiums = await Stadium.find().populate('mainClub', 'name shortName logoUrl location');
    res.json(stadiums);
  } catch (error) {
    next(error);
  }
};

export const createStadium = async (req, res, next) => {
  try {
    const inputError = checkStadiumInput(req.body);
    if (inputError) return res.status(400).json({ message: inputError });

    const stadium = await Stadium.create(ownershipFields(pickStadiumFields(req.body)));
    logAudit(req.user, { action: 'create', entity: 'stadium', entityId: stadium._id, summary: `Creó el estadio ${stadium.name}` });
    res.status(201).json(stadium);
  } catch (error) {
    next(error);
  }
};

export const updateStadium = async (req, res, next) => {
  try {
    const inputError = checkStadiumInput(req.body);
    if (inputError) return res.status(400).json({ message: inputError });

    const updates = ownershipFields(pickStadiumFields(req.body));
    const stadium = await Stadium.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('mainClub', 'name shortName logoUrl location');

    if (!stadium) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    logAudit(req.user, { action: 'update', entity: 'stadium', entityId: stadium._id, summary: `Editó el estadio ${stadium.name}`, fields: Object.keys(updates) });

    res.json(stadium);
  } catch (error) {
    next(error);
  }
};

export const deleteStadium = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stadium = await Stadium.findByIdAndDelete(id);

    if (!stadium) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    await Visit.deleteMany({ stadium: id });
    await User.updateMany({ wantToVisit: id }, { $pull: { wantToVisit: id } });

    logAudit(req.user, { action: 'delete', entity: 'stadium', entityId: id, summary: `Eliminó el estadio ${stadium.name}` });
    res.json({ message: 'Estadio eliminado' });
  } catch (error) {
    next(error);
  }
};

export const getStadiumById = async (req, res, next) => {
  try {
    const stadium = await Stadium.findById(req.params.id).populate(
      'mainClub',
      'name shortName logoUrl location'
    );

    if (!stadium) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    const visits = await Visit.find({ stadium: stadium._id })
      .populate('user', 'username avatarUrl')
      .sort({ visitDate: -1 });

    res.json({ stadium, visits });
  } catch (error) {
    next(error);
  }
};
