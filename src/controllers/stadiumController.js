import { isText, isNumberInRange, isObjectId, isCloudinaryUrl } from '../utils/validation.js';
import Stadium from '../models/Stadium.js';
import Visit from '../models/Visit.js';
import User from '../models/User.js';
import Report from '../models/Report.js';
import Club from '../models/Club.js';
import { logAudit, diffChanges } from '../utils/audit.js';
import { destroyImages } from './visitController.js';
import { importDrafts } from '../utils/wikidataImport.js';
import { FICHA_FIELDS, checkFichaInput, syncCover, removedPhotoUrls } from '../utils/stadiumFicha.js';

// Valida solo los campos que llegan; devuelve un mensaje de error o null
async function checkStadiumInput(body) {
  const { name, capacity, location, imageUrl, mainClub } = body;
  const fichaError = checkFichaInput(body);
  if (fichaError) return fichaError;
  if (imageUrl !== undefined && imageUrl !== '' && !isCloudinaryUrl(imageUrl)) return 'La imagen debe ser una URL de Cloudinary';
  if (mainClub && (!isObjectId(mainClub) || !(await Club.exists({ _id: mainClub })))) return 'El club elegido no existe';
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
const STADIUM_FIELDS = ['name', 'capacity', 'location', 'ownerType', 'mainClub', 'imageUrl', ...FICHA_FIELDS];
function pickStadiumFields(body) {
  return syncCover(Object.fromEntries(STADIUM_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])));
}

// Un estadio de la provincia no tiene club dueño; el resto puede tener mainClub o quedar sin dueño
function ownershipFields(body) {
  if (body.ownerType === undefined && body.mainClub === undefined) return body; // actualización parcial (ej. solo las fotos): no toca el dueño
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

// Sugerencias de Wikidata pendientes de revisar (solo admin)
export const getDrafts = async (req, res, next) => {
  try {
    const stadiums = await Stadium.find({ wikidataDraft: { $ne: null } }).select('+wikidataDraft');
    res.json(stadiums.map((stadium) => ({ _id: stadium._id, draft: stadium.wikidataDraft })));
  } catch (error) {
    next(error);
  }
};

// Búsqueda en Wikidata lanzada desde el panel. Tarda (hay una pausa entre estadios), así que corre en segundo plano
// y el panel consulta el avance. ponytail: estado en memoria, se pierde si el servidor reinicia o hay varias instancias.
let wikidataJob = { status: 'idle' };

export const startWikidataImport = (req, res) => {
  if (wikidataJob.status === 'running') return res.status(409).json({ message: 'Ya hay una búsqueda en curso', job: wikidataJob });
  wikidataJob = { status: 'running', done: 0, total: 0, saved: 0, failed: 0, startedAt: new Date() };
  logAudit(req.user, { action: 'update', entity: 'stadium', summary: 'Inició la búsqueda de datos en Wikidata' });
  importDrafts({ onProgress: (progress) => { wikidataJob = { ...wikidataJob, ...progress }; } })
    .then((result) => { wikidataJob = { ...wikidataJob, ...result, status: 'done', finishedAt: new Date() }; })
    .catch((error) => {
      console.error('Falló la búsqueda en Wikidata:', error.message);
      wikidataJob = { ...wikidataJob, status: 'error', finishedAt: new Date() };
    });
  res.status(202).json(wikidataJob);
};

export const getWikidataImport = (req, res) => res.json(wikidataJob);

export const createStadium = async (req, res, next) => {
  try {
    const inputError = await checkStadiumInput(req.body);
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
    const inputError = await checkStadiumInput(req.body);
    if (inputError) return res.status(400).json({ message: inputError });

    const updates = ownershipFields(pickStadiumFields(req.body));
    if (req.body.clearDraft === true) updates.wikidataDraft = null; // el admin ya revisó la sugerencia de Wikidata
    const previous = await Stadium.findById(req.params.id);
    if (!previous) return res.status(404).json({ message: 'Estadio no encontrado' });

    const stadium = await Stadium.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('mainClub', 'name shortName logoUrl location');

    if (!stadium) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    // Las fotos quitadas se borran también de Cloudinary
    await destroyImages(removedPhotoUrls(previous, updates));

    logAudit(req.user, { action: 'update', entity: 'stadium', entityId: stadium._id, summary: `Editó el estadio ${stadium.name}`, fields: Object.keys(updates), changes: diffChanges(previous, updates) });

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

    // Se van con el estadio sus reseñas, las fotos de ellas, sus denuncias y las guardadas de otros
    const visits = await Visit.find({ stadium: id }).select('images');
    const visitIds = visits.map((visit) => visit._id);
    await destroyImages([...visits.flatMap((visit) => visit.images), stadium.imageUrl, ...stadium.photos.map((photo) => photo.url)].filter(Boolean));
    await Promise.all([
      Visit.deleteMany({ stadium: id }),
      Report.deleteMany({ visit: { $in: visitIds } }),
      User.updateMany({ savedVisits: { $in: visitIds } }, { $pull: { savedVisits: { $in: visitIds } } }),
      User.updateMany({ wantToVisit: id }, { $pull: { wantToVisit: id } }),
    ]);

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
      .sort({ visitDate: -1 })
      .limit(200);

    res.json({ stadium, visits });
  } catch (error) {
    next(error);
  }
};
