import Visit from '../models/Visit.js';
import User from '../models/User.js';
import cloudinary from '../config/cloudinary.js';
import { isText, isNumberInRange, safeParse, textWithin } from '../utils/validation.js';
import Report from '../models/Report.js';
import { logAudit } from '../utils/audit.js';

const MAX_VISIT_PHOTOS = 4;
const MAX_REVIEW_CHARS = 300;
const REVIEW_TOO_LONG = `La reseña no puede tener más de ${MAX_REVIEW_CHARS} caracteres`;
// Paginación opcional: ?page=N&limit=M (máximo 100). Sin parámetros se devuelve todo.
function paginationFrom(req) {
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 0, 100);
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  return {
    query: (q) => (limit > 0 ? q.skip((page - 1) * limit).limit(limit) : q),
  };
}

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
export function destroyImages(urls) {
  return Promise.all(urls.map((url) => {
    const publicId = publicIdFromUrl(url);
    return publicId ? cloudinary.uploader.destroy(publicId).catch(() => {}) : null;
  }));
}

// Tope por rubro de gasto (en pesos); el mismo que aplica el formulario
const MAX_EXPENSE = 2000000;
const EXPENSE_KEYS = ['ticket', 'food', 'parking', 'transport'];
const bad = (message) => ({ error: message });

// Valida los datos de una visita (crear o editar). Solo mira los campos que llegan.
// Devuelve { error } o los valores ya parseados.
function checkVisitInput({ visitDate, rating, reviewText, matchDetails, expenses, removeImages }) {
  if (visitDate !== undefined) {
    if (Number.isNaN(new Date(visitDate).getTime())) return bad('La fecha de la visita no es válida');
    if (isFutureDate(visitDate)) return bad('La fecha de la visita no puede ser posterior a hoy');
  }
  if (rating !== undefined && !isNumberInRange(Number(rating), 1, 10)) {
    return bad('La puntuación debe estar entre 1 y 10');
  }
  if (reviewText !== undefined) {
    if (!isText(reviewText)) return bad('La reseña debe ser texto');
    if (reviewText.length > MAX_REVIEW_CHARS) return bad(REVIEW_TOO_LONG);
  }

  const parsedMatch = safeParse(matchDetails);
  if (!parsedMatch.ok) return bad('Los datos del partido no son válidos');
  if (parsedMatch.value !== undefined) {
    const m = parsedMatch.value;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return bad('Los datos del partido no son válidos');
    const { homeTeam = '', awayTeam = '', score = '' } = m;
    const textOk = [homeTeam, awayTeam, score].every(isText)
      && homeTeam.length <= 100 && awayTeam.length <= 100 && score.length <= 20;
    if (!textOk) return bad('Los datos del partido no son válidos');
    if (sameTeamError(m)) return bad(MATCH_SAME_TEAM);
  }

  const parsedExpenses = safeParse(expenses);
  if (!parsedExpenses.ok) return bad('Los gastos no son válidos');
  if (parsedExpenses.value !== undefined) {
    const e = parsedExpenses.value;
    const amountsOk = e && typeof e === 'object' && !Array.isArray(e)
      && EXPENSE_KEYS.every((key) => isNumberInRange(Number(e[key] ?? 0), 0, MAX_EXPENSE));
    if (!amountsOk) return bad('Los gastos deben ser montos positivos');
  }

  const parsedRemove = safeParse(removeImages);
  const removeOk = parsedRemove.ok
    && (parsedRemove.value === undefined || (Array.isArray(parsedRemove.value) && parsedRemove.value.every(isText)));
  if (!removeOk) return bad('Las fotos a quitar no son válidas');

  return {
    match: parsedMatch.value,
    expenses: parsedExpenses.value,
    removeImages: parsedRemove.value || [],
  };
}

export const createVisit = async (req, res, next) => {
  try {
    const { stadium, visitDate, rating, reviewText } = req.body;
    const files = req.files || [];

    // Si la validación falla, las fotos ya subidas a Cloudinary no quedan huérfanas
    const fail = async (message) => {
      await destroyImages(files.map((f) => f.path));
      return res.status(400).json({ message });
    };

    if (!stadium || !visitDate || !rating) {
      return fail('Faltan campos obligatorios');
    }
    const check = checkVisitInput(req.body);
    if (check.error) return fail(check.error);

    const visit = await Visit.create({
      user: req.user._id,
      stadium,
      visitDate,
      rating,
      reviewText,
      images: files.map((file) => file.path),
      matchDetails: check.match,
      expenses: check.expenses,
    });

    await User.findByIdAndUpdate(req.user._id, { $pull: { wantToVisit: stadium } });

    logAudit(req.user, { action: 'create', entity: 'visit', entityId: visit._id, summary: 'Publicó una reseña' });
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

    const { rating, reviewText, visitDate } = req.body;
    const newFiles = req.files || [];
    const fail = async (message) => {
      await destroyImages(newFiles.map((f) => f.path));
      return res.status(400).json({ message });
    };

    const check = checkVisitInput(req.body);
    if (check.error) return fail(check.error);

    // Fotos que el usuario quitó en el modal de edición (solo las que realmente son de esta visita)
    const toRemove = check.removeImages;
    const removed = visit.images.filter((url) => toRemove.includes(url));
    const kept = visit.images.filter((url) => !toRemove.includes(url));

    // Las fotos nuevas se suman a las que quedan; el tope es 4 en total
    if (kept.length + newFiles.length > MAX_VISIT_PHOTOS) {
      return fail(`Una visita puede tener hasta ${MAX_VISIT_PHOTOS} fotos`);
    }

    if (rating !== undefined) visit.rating = rating;
    if (reviewText !== undefined) visit.reviewText = reviewText;
    if (visitDate !== undefined) visit.visitDate = visitDate;
    if (check.match !== undefined) visit.matchDetails = check.match;
    if (check.expenses !== undefined) visit.expenses = check.expenses;
    visit.images = [...kept, ...newFiles.map((f) => f.path)];

    await visit.save();
    await destroyImages(removed);
    logAudit(req.user, { action: 'update', entity: 'visit', entityId: visit._id, summary: 'Editó una reseña' });
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
    await User.updateMany({ savedVisits: visit._id }, { $pull: { savedVisits: visit._id } });
    logAudit(req.user, { action: 'delete', entity: 'visit', entityId: visit._id, summary: 'Eliminó una reseña' });
    res.json({ message: 'Visita eliminada' });
  } catch (error) {
    next(error);
  }
};

export const getVisitsByUser = async (req, res, next) => {
  try {
    const { query: pageQuery } = paginationFrom(req);
    const visits = await pageQuery(Visit.find({ user: req.params.userId }))
      .populate({
        path: 'stadium',
        select: 'name imageUrl location mainClub',
        populate: { path: 'mainClub', select: 'name logoUrl location' },
      })
      .populate('user', 'username avatarUrl')
      .sort({ createdAt: -1 });

    res.json(visits);
  } catch (error) {
    next(error);
  }
};

export const getVisitsByStadium = async (req, res, next) => {
  try {
    const { query: pageQuery } = paginationFrom(req);
    const visits = await pageQuery(Visit.find({ stadium: req.params.stadiumId }))
      .populate('user', 'username avatarUrl')
      .sort({ visitDate: -1 });

    res.json(visits);
  } catch (error) {
    next(error);
  }
};

// Me gusta: se puede dar a reseñas de otros usuarios; el dueño no puede darse like a sí mismo
export const toggleLike = async (req, res, next) => {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.user.toString() === req.user.id) {
      return res.status(400).json({ message: 'No podés darle me gusta a tu propia reseña' });
    }

    const index = visit.likes.findIndex((id) => id.toString() === req.user.id);
    if (index === -1) {
      visit.likes.push(req.user._id);
    } else {
      visit.likes.splice(index, 1);
    }
    await visit.save();

    res.json({ liked: index === -1, likesCount: visit.likes.length });
  } catch (error) {
    next(error);
  }
};

// Guardar: lista privada del usuario con las reseñas que quiere volver a ver
export const toggleSave = async (req, res, next) => {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.user.toString() === req.user.id) {
      return res.status(400).json({ message: 'No podés guardar tu propia reseña' });
    }

    const user = await User.findById(req.user._id);
    const isSaved = user.savedVisits.some((id) => id.toString() === visit._id.toString());
    if (isSaved) {
      user.savedVisits.pull(visit._id);
    } else {
      user.savedVisits.push(visit._id);
    }
    await user.save();

    res.json({ saved: !isSaved });
  } catch (error) {
    next(error);
  }
};

// Datos que necesitan las cards de reseñas guardadas o con me gusta
const populateVisitCard = (query) => query
  .populate({
    path: 'stadium',
    select: 'name imageUrl location mainClub',
    populate: { path: 'mainClub', select: 'name logoUrl location' },
  })
  .populate('user', 'username avatarUrl');

// Privadas: solo el usuario logueado ve sus guardadas
export const getSavedVisits = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'savedVisits',
      populate: [
        {
          path: 'stadium',
          select: 'name imageUrl location mainClub',
          populate: { path: 'mainClub', select: 'name logoUrl location' },
        },
        { path: 'user', select: 'username avatarUrl' },
      ],
    });

    res.json(user.savedVisits.filter(Boolean));
  } catch (error) {
    next(error);
  }
};

// Privadas: reseñas de otros a las que el usuario logueado les dio me gusta
export const getLikedVisits = async (req, res, next) => {
  try {
    const visits = await populateVisitCard(Visit.find({ likes: req.user._id }).sort({ visitDate: -1 }));
    res.json(visits);
  } catch (error) {
    next(error);
  }
};

// Denuncia: solo reseñas de otros, una vez por usuario
export const reportVisit = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!isText(reason) || !reason.trim() || reason.length > 300) {
      return res.status(400).json({ message: 'Contá el motivo en hasta 300 caracteres' });
    }
    const visit = await Visit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.user.toString() === req.user.id) {
      return res.status(400).json({ message: 'No podés denunciar tu propia reseña' });
    }

    try {
      await Report.create({ visit: visit._id, reporter: req.user._id, reason });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Ya denunciaste esta reseña' });
      }
      throw error;
    }
    res.status(201).json({ message: 'Gracias, revisaremos la reseña' });
  } catch (error) {
    next(error);
  }
};

// Admin: denuncias abiertas con la reseña y los usuarios involucrados
export const getReports = async (req, res, next) => {
  try {
    const reports = await Report.find({ status: 'open' })
      .sort({ createdAt: -1 })
      .populate('reporter', 'username')
      .populate({
        path: 'visit',
        select: 'reviewText rating visitDate user stadium',
        populate: [
          { path: 'user', select: 'username' },
          { path: 'stadium', select: 'name' },
        ],
      });
    res.json(reports);
  } catch (error) {
    next(error);
  }
};

// Admin (y superadmin): borra cualquier reseña directamente, con motivo obligatorio (queda en la auditoría)
export const adminDeleteVisit = async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 300) {
      return res.status(400).json({ message: "El motivo debe tener entre 5 y 300 caracteres" });
    }

    const visit = await Visit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ message: "Visita no encontrada" });
    }

    await destroyImages(visit.images);
    await User.updateMany({ savedVisits: visit._id }, { $pull: { savedVisits: visit._id } });
    await Report.deleteMany({ visit: visit._id });
    await visit.deleteOne();

    logAudit(req.user, { action: "delete", entity: "visit", entityId: visit._id, summary: `Eliminó una reseña (motivo: ${reason})` });
    res.json({ message: "Reseña eliminada" });
  } catch (error) {
    next(error);
  }
};

// Admin: descartar la denuncia o quitar la reseña (y con ella sus denuncias)
export const resolveReport = async (req, res, next) => {
  try {
    const { action } = req.body;
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'Denuncia no encontrada' });
    }

    if (action === 'remove_review') {
      const visit = await Visit.findById(report.visit);
      if (visit) {
        await destroyImages(visit.images);
        await User.updateMany({ savedVisits: visit._id }, { $pull: { savedVisits: visit._id } });
        await visit.deleteOne();
      }
      await Report.deleteMany({ visit: report.visit });
      logAudit(req.user, { action: 'resolve', entity: 'report', entityId: report._id, summary: 'Quitó una reseña denunciada' });
      return res.json({ message: 'Reseña eliminada' });
    }
    if (action === 'dismiss') {
      report.status = 'resolved';
      await report.save();
      logAudit(req.user, { action: 'resolve', entity: 'report', entityId: report._id, summary: 'Descartó una denuncia' });
      return res.json({ message: 'Denuncia descartada' });
    }
    return res.status(400).json({ message: 'Acción inválida' });
  } catch (error) {
    next(error);
  }
};
