import { isText, isNumberInRange, isId, isCloudinaryUrl } from '../utils/validation.js';
import prisma from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.ts';
import { logAudit, diffChanges } from '../utils/audit.js';
import { destroyImages } from './visitController.js';
import { importDrafts } from '../utils/wikidataImport.js';
import { FICHA_FIELDS, checkFichaInput, syncCover, removedPhotoUrls } from '../utils/stadiumFicha.js';
import { stadiumJson, stadiumInclude, visitJson, visitBaseInclude, userCard, userCardSelect } from '../db/serialize.js';

// Valida solo los campos que llegan; devuelve un mensaje de error o null
async function checkStadiumInput(body) {
  const { name, capacity, location, imageUrl, mainClub } = body;
  const fichaError = checkFichaInput(body);
  if (fichaError) return fichaError;
  if (imageUrl !== undefined && imageUrl !== '' && !isCloudinaryUrl(imageUrl)) return 'La imagen debe ser una URL de Cloudinary';
  if (mainClub && (!isId(mainClub) || !(await prisma.club.findUnique({ where: { id: mainClub }, select: { id: true } })))) return 'El club elegido no existe';
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

// Número o null (vacío = sin dato), como hacía Mongo al guardar '' en un campo numérico
const numberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

// Campos de la API (forma de siempre) → columnas de la tabla. Las fotos se guardan aparte.
function toColumns(fields) {
  const data = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.capacity !== undefined) data.capacity = Number(fields.capacity);
  if (fields.location !== undefined) {
    const { city, province, country, coordinates = {} } = fields.location;
    Object.assign(data, { city, province: province ?? '', country, lat: numberOrNull(coordinates.lat), lng: numberOrNull(coordinates.lng) });
  }
  if (fields.ownerType !== undefined) data.ownerType = fields.ownerType;
  if (fields.mainClub !== undefined) data.mainClubId = fields.mainClub || null;
  for (const key of ['imageUrl', 'nickname', 'surface', 'status', 'history', 'funFacts', 'otherUses']) {
    if (fields[key] !== undefined) data[key] = fields[key];
  }
  if (fields.openedYear !== undefined) data.openedYear = numberOrNull(fields.openedYear);
  if (fields.pitch !== undefined) {
    data.pitchLength = numberOrNull(fields.pitch?.length);
    data.pitchWidth = numberOrNull(fields.pitch?.width);
  }
  return data;
}

const photoRows = (photos) => photos.map((p, position) => ({ position, url: p.url, credit: p.credit ?? '' }));

export const getStadiums = async (req, res, next) => {
  try {
    const stadiums = await prisma.stadium.findMany({ include: stadiumInclude, orderBy: { seq: 'asc' } });
    res.json(stadiums.map(stadiumJson));
  } catch (error) {
    next(error);
  }
};

// Sugerencias de Wikidata pendientes de revisar (solo admin)
export const getDrafts = async (req, res, next) => {
  try {
    const stadiums = await prisma.stadium.findMany({
      where: { wikidataDraft: { not: Prisma.DbNull } },
      select: { id: true, wikidataDraft: true },
      orderBy: { seq: 'asc' },
    });
    res.json(stadiums.map((stadium) => ({ _id: stadium.id, draft: stadium.wikidataDraft })));
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

    const fields = ownershipFields(pickStadiumFields(req.body));
    const stadium = await prisma.stadium.create({
      data: { ...toColumns(fields), ...(Array.isArray(fields.photos) && { photos: { create: photoRows(fields.photos) } }) },
      include: { photos: stadiumInclude.photos },
    });
    logAudit(req.user, { action: 'create', entity: 'stadium', entityId: stadium.id, summary: `Creó el estadio ${stadium.name}` });
    res.status(201).json(stadiumJson(stadium));
  } catch (error) {
    next(error);
  }
};

export const updateStadium = async (req, res, next) => {
  try {
    const inputError = await checkStadiumInput(req.body);
    if (inputError) return res.status(400).json({ message: inputError });

    const updates = ownershipFields(pickStadiumFields(req.body));
    const found = isId(req.params.id)
      ? await prisma.stadium.findUnique({ where: { id: req.params.id }, include: { photos: stadiumInclude.photos } })
      : null;
    if (!found) return res.status(404).json({ message: 'Estadio no encontrado' });
    const previous = stadiumJson(found); // mainClub como id, igual que el documento sin poblar de antes

    const data = toColumns(updates);
    if (req.body.clearDraft === true) data.wikidataDraft = Prisma.DbNull; // el admin ya revisó la sugerencia de Wikidata
    // Las fotos se reemplazan completas, en el orden en que llegan (la primera es la portada)
    if (Array.isArray(updates.photos)) data.photos = { deleteMany: {}, create: photoRows(updates.photos) };
    const stadium = await prisma.stadium.update({ where: { id: found.id }, data, include: stadiumInclude });

    // Las fotos quitadas se borran también de Cloudinary
    await destroyImages(removedPhotoUrls(previous, updates));

    logAudit(req.user, { action: 'update', entity: 'stadium', entityId: stadium.id, summary: `Editó el estadio ${stadium.name}`, fields: Object.keys(updates), changes: diffChanges(previous, updates) });

    res.json(stadiumJson(stadium));
  } catch (error) {
    next(error);
  }
};

export const deleteStadium = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stadium = isId(id)
      ? await prisma.stadium.findUnique({
        where: { id },
        include: { photos: { select: { url: true } }, visits: { select: { images: { select: { url: true } } } } },
      })
      : null;
    if (!stadium) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    // Con el estadio se van (en cascada) sus reseñas, sus denuncias, las guardadas, los "por visitar" y sus sugerencias
    await prisma.stadium.delete({ where: { id } });
    const visitImages = stadium.visits.flatMap((visit) => visit.images.map((image) => image.url));
    await destroyImages([...visitImages, stadium.imageUrl, ...stadium.photos.map((photo) => photo.url)].filter(Boolean));

    logAudit(req.user, { action: 'delete', entity: 'stadium', entityId: id, summary: `Eliminó el estadio ${stadium.name}` });
    res.json({ message: 'Estadio eliminado' });
  } catch (error) {
    next(error);
  }
};

export const getStadiumById = async (req, res, next) => {
  try {
    const stadium = isId(req.params.id)
      ? await prisma.stadium.findUnique({ where: { id: req.params.id }, include: stadiumInclude })
      : null;

    if (!stadium) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    const visits = await prisma.visit.findMany({
      where: { stadiumId: stadium.id, hidden: false },
      include: { ...visitBaseInclude, user: { select: userCardSelect } },
      orderBy: [{ visitDate: 'desc' }, { seq: 'asc' }],
      take: 200,
    });

    res.json({ stadium: stadiumJson(stadium), visits: visits.map((v) => visitJson(v, { user: userCard(v.user) })) });
  } catch (error) {
    next(error);
  }
};
