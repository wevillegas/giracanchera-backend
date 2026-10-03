import Visit from '../models/Visit.js';
import User from '../models/User.js';
import cloudinary from '../config/cloudinary.js';

const MAX_VISIT_PHOTOS = 4;
const MAX_REVIEW_CHARS = 300;
const REVIEW_TOO_LONG = `La reseña no puede tener más de ${MAX_REVIEW_CHARS} caracteres`;
const MATCH_SAME_TEAM = 'El local y el visitante no pueden ser el mismo club';

// El partido es opcional; si se carga, local y visitante tienen que ser distintos
function sameTeamError(matchDetails) {
  const { homeTeam, awayTeam } = matchDetails || {};
  return homeTeam && awayTeam && homeTeam === awayTeam ? MATCH_SAME_TEAM : null;
}

// La fecha llega como 'YYYY-MM-DD' desde el formulario; no puede ser posterior a hoy
function isFutureDate(value) {
  const today = new Date();
  const todayStr = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((n, i) => (i === 0 ? n : String(n).padStart(2, '0')))
    .join('-');
  return new Date(value).toISOString().slice(0, 10) > todayStr;
}

// Cloudinary guarda la URL como .../upload/v123/carpeta/nombre.jpg; el public_id es carpeta/nombre
function publicIdFromUrl(url) {
  const part = url.split('/upload/')[1];
  return part ? part.replace(/^v\d+\//, '').replace(/\.[^.]+$/, '') : null;
}

// Borra fotos de Cloudinary; si falla una, no frena la respuesta
function destroyImages(urls) {
  return Promise.all(urls.map((url) => {
    const publicId = publicIdFromUrl(url);
    return publicId ? cloudinary.uploader.destroy(publicId).catch(() => {}) : null;
  }));
}

export const createVisit = async (req, res, next) => {
  try {
    const { stadium, visitDate, rating, reviewText, matchDetails, expenses } = req.body;

    if (!stadium || !visitDate || !rating) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }
    if (isFutureDate(visitDate)) {
      await destroyImages((req.files || []).map((f) => f.path));
      return res.status(400).json({ message: 'La fecha de la visita no puede ser posterior a hoy' });
    }
    if (reviewText && reviewText.length > MAX_REVIEW_CHARS) {
      await destroyImages((req.files || []).map((f) => f.path));
      return res.status(400).json({ message: REVIEW_TOO_LONG });
    }
    const parsedMatch = matchDetails ? JSON.parse(matchDetails) : undefined;
    if (sameTeamError(parsedMatch)) {
      await destroyImages((req.files || []).map((f) => f.path));
      return res.status(400).json({ message: MATCH_SAME_TEAM });
    }

    const images = (req.files || []).map((file) => file.path);

    const visit = await Visit.create({
      user: req.user._id,
      stadium,
      visitDate,
      rating,
      reviewText,
      images,
      matchDetails: parsedMatch,
      expenses: expenses ? JSON.parse(expenses) : undefined,
    });

    await User.findByIdAndUpdate(req.user._id, { $pull: { wantToVisit: stadium } });

    res.status(201).json(visit);
  } catch (error) {
    next(error);
  }
};

export const updateVisit = async (req, res, next) => {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'No podés editar esta visita' });
    }

    const { rating, reviewText, visitDate, matchDetails, expenses, removeImages } = req.body;
    if (visitDate !== undefined && isFutureDate(visitDate)) {
      await destroyImages((req.files || []).map((f) => f.path));
      return res.status(400).json({ message: 'La fecha de la visita no puede ser posterior a hoy' });
    }
    if (reviewText !== undefined && reviewText.length > MAX_REVIEW_CHARS) {
      await destroyImages((req.files || []).map((f) => f.path));
      return res.status(400).json({ message: REVIEW_TOO_LONG });
    }

    // Fotos que el usuario quitó en el modal de edición (solo las que realmente son de esta visita)
    const toRemove = removeImages ? JSON.parse(removeImages) : [];
    const removed = visit.images.filter((url) => toRemove.includes(url));
    const kept = visit.images.filter((url) => !toRemove.includes(url));
    const newFiles = req.files || [];

    // Las fotos nuevas se suman a las que quedan; el tope es 4 en total
    if (kept.length + newFiles.length > MAX_VISIT_PHOTOS) {
      await destroyImages(newFiles.map((f) => f.path));
      return res.status(400).json({ message: `Una visita puede tener hasta ${MAX_VISIT_PHOTOS} fotos` });
    }

    if (rating !== undefined) visit.rating = rating;
    if (reviewText !== undefined) visit.reviewText = reviewText;
    if (visitDate !== undefined) visit.visitDate = visitDate;
    if (matchDetails) {
      const parsedMatch = JSON.parse(matchDetails);
      if (sameTeamError(parsedMatch)) {
        await destroyImages(newFiles.map((f) => f.path));
        return res.status(400).json({ message: MATCH_SAME_TEAM });
      }
      visit.matchDetails = parsedMatch;
    }
    if (expenses) visit.expenses = JSON.parse(expenses);
    visit.images = [...kept, ...newFiles.map((f) => f.path)];

    await visit.save();
    await destroyImages(removed);
    res.json(visit);
  } catch (error) {
    next(error);
  }
};

export const deleteVisit = async (req, res, next) => {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'No podés eliminar esta visita' });
    }

    await visit.deleteOne();
    res.json({ message: 'Visita eliminada' });
  } catch (error) {
    next(error);
  }
};

export const getVisitsByUser = async (req, res, next) => {
  try {
    const visits = await Visit.find({ user: req.params.userId })
      .populate({
        path: 'stadium',
        select: 'name imageUrl location mainClub',
        populate: { path: 'mainClub', select: 'name logoUrl location' },
      })
      .populate('user', 'username avatarUrl')
      .sort({ visitDate: -1 });

    res.json(visits);
  } catch (error) {
    next(error);
  }
};

export const getVisitsByStadium = async (req, res, next) => {
  try {
    const visits = await Visit.find({ stadium: req.params.stadiumId })
      .populate('user', 'username avatarUrl')
      .sort({ visitDate: -1 });

    res.json(visits);
  } catch (error) {
    next(error);
  }
};
