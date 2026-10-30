import prisma from '../config/prisma.js';
import cloudinary from '../config/cloudinary.js';
import { isText, isNumberInRange, safeParse, isId, escapeLike } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';
import { stadiumExists } from '../utils/refs.js';
import {
  visitJson, visitBaseInclude, visitColumnsFrom, userCard, userCardSelect, stadiumCard, stadiumCardSelect,
} from '../db/serialize.js';

const MAX_VISIT_PHOTOS = 4;
const MAX_REVIEW_CHARS = 1000;
const REVIEW_TOO_LONG = `La reseña no puede tener más de ${MAX_REVIEW_CHARS} caracteres`;
// Paginación: ?page=N&limit=M (máximo 200). Sin limit se devuelven 200 reseñas,
// para que un estadio o perfil con miles de reseñas no devuelva todo en un solo request.
const DEFAULT_LIMIT = 200;
function paginationFrom(req) {
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT, DEFAULT_LIMIT);
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  return limit > 0 ? { skip: (page - 1) * limit, take: limit } : {};
}

// Reseñas ocultas por moderación: no cuentan en listas, estadísticas ni puntajes públicos
export const NOT_HIDDEN = { hidden: false };

// Cuenta silenciada por un admin: no puede publicar ni editar reseñas hasta esa fecha
export function mutedError(user) {
  if (!user?.mutedUntil || user.mutedUntil <= new Date()) return null;
  return `Tu cuenta está silenciada hasta el ${user.mutedUntil.toLocaleDateString('es-AR')}: no podés publicar ni editar reseñas`;
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
  if (rating !== undefined && !(Number.isInteger(Number(rating)) && isNumberInRange(Number(rating), 1, 10))) {
    return bad('La puntuación debe ser un número entero entre 1 y 10');
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


// Reseña con su autor y su estadio resumido (las cards de perfil, guardadas y me gusta)
const visitCardInclude = { ...visitBaseInclude, user: { select: userCardSelect }, stadium: { select: stadiumCardSelect } };
const visitCard = (v) => visitJson(v, { user: userCard(v.user), stadium: stadiumCard(v.stadium) });

const findVisit = (id, options = {}) => (isId(id) ? prisma.visit.findUnique({ where: { id }, ...options }) : null);

export const createVisit = async (req, res, next) => {
  try {
    const muted = mutedError(req.user);
    if (muted) {
      await destroyImages((req.files || []).map((f) => f.path));
      return res.status(403).json({ message: muted });
    }
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
    if (!(await stadiumExists(stadium))) return fail('El estadio no existe');

    const visit = await prisma.visit.create({
      data: {
        userId: req.user.id,
        stadiumId: stadium,
        visitDate: new Date(visitDate),
        rating: Number(rating),
        reviewText: reviewText ?? '',
        ...visitColumnsFrom({ matchDetails: check.match, expenses: check.expenses }),
        images: { create: files.map((file, position) => ({ position, url: file.path })) },
      },
      include: visitBaseInclude,
    });

    // Ya lo visitó: deja de estar "por visitar"
    await prisma.wishlist.deleteMany({ where: { userId: req.user.id, stadiumId: stadium } });

    logAudit(req.user, { action: 'create', entity: 'visit', entityId: visit.id, summary: 'Publicó una reseña' });
    res.status(201).json(visitJson(visit));
  } catch (error) {
    next(error);
  }
};

export const updateVisit = async (req, res, next) => {
  try {
    const muted = mutedError(req.user);
    if (muted) {
      await destroyImages((req.files || []).map((f) => f.path));
      return res.status(403).json({ message: muted });
    }
    const visit = await findVisit(req.params.id, { include: { images: visitBaseInclude.images } });
    if (!visit) {
      await destroyImages((req.files || []).map((f) => f.path));
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.userId !== req.user.id) {
      await destroyImages((req.files || []).map((f) => f.path));
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
    const current = visit.images.map((image) => image.url);
    const removed = current.filter((url) => check.removeImages.includes(url));
    const kept = current.filter((url) => !check.removeImages.includes(url));

    // Las fotos nuevas se suman a las que quedan; el tope es 4 en total
    if (kept.length + newFiles.length > MAX_VISIT_PHOTOS) {
      return fail(`Una visita puede tener hasta ${MAX_VISIT_PHOTOS} fotos`);
    }

    const images = [...kept, ...newFiles.map((f) => f.path)];
    const updated = await prisma.visit.update({
      where: { id: visit.id },
      data: {
        ...(rating !== undefined && { rating: Number(rating) }),
        ...(reviewText !== undefined && { reviewText }),
        ...(visitDate !== undefined && { visitDate: new Date(visitDate) }),
        ...visitColumnsFrom({ matchDetails: check.match, expenses: check.expenses }),
        images: { deleteMany: {}, create: images.map((url, position) => ({ position, url })) },
      },
      include: visitBaseInclude,
    });
    await destroyImages(removed);
    logAudit(req.user, { action: 'update', entity: 'visit', entityId: updated.id, summary: 'Editó una reseña' });
    res.json(visitJson(updated));
  } catch (error) {
    next(error);
  }
};

export const deleteVisit = async (req, res, next) => {
  try {
    const visit = await findVisit(req.params.id, { include: { images: visitBaseInclude.images } });
    if (!visit) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.userId !== req.user.id) {
      return res.status(403).json({ message: 'No podés eliminar esta visita' });
    }

    // Se van con la reseña (en cascada) sus fotos, likes, guardadas y denuncias
    await prisma.visit.delete({ where: { id: visit.id } });
    await destroyImages(visit.images.map((image) => image.url));
    logAudit(req.user, { action: 'delete', entity: 'visit', entityId: visit.id, summary: 'Eliminó una reseña' });
    res.json({ message: 'Visita eliminada' });
  } catch (error) {
    next(error);
  }
};

export const getVisitsByUser = async (req, res, next) => {
  try {
    if (!isId(req.params.userId)) return res.status(400).json({ message: 'Datos inválidos' });
    // El dueño ve también sus reseñas ocultas (con el motivo), para enterarse; los demás no
    const isOwner = Boolean(req.user) && req.user.id === req.params.userId;
    const visits = await prisma.visit.findMany({
      where: { userId: req.params.userId, ...(isOwner ? {} : NOT_HIDDEN) },
      include: visitCardInclude,
      orderBy: [{ createdAt: 'desc' }, { seq: 'asc' }],
      ...paginationFrom(req),
    });

    res.json(visits.map(visitCard));
  } catch (error) {
    next(error);
  }
};

export const getVisitsByStadium = async (req, res, next) => {
  try {
    if (!isId(req.params.stadiumId)) return res.status(400).json({ message: 'Datos inválidos' });
    const visits = await prisma.visit.findMany({
      where: { stadiumId: req.params.stadiumId, ...NOT_HIDDEN },
      include: { ...visitBaseInclude, user: { select: userCardSelect } },
      orderBy: [{ visitDate: 'desc' }, { seq: 'asc' }],
      ...paginationFrom(req),
    });

    res.json(visits.map((v) => visitJson(v, { user: userCard(v.user) })));
  } catch (error) {
    next(error);
  }
};

// Me gusta: se puede dar a reseñas de otros usuarios; el dueño no puede darse like a sí mismo
export const toggleLike = async (req, res, next) => {
  try {
    const visit = await findVisit(req.params.id, { select: { id: true, userId: true, hidden: true } });
    if (!visit || visit.hidden) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.userId === req.user.id) {
      return res.status(400).json({ message: 'No podés darle me gusta a tu propia reseña' });
    }

    // Si ya estaba, se quita; si no, se agrega. Dos clics rápidos no duplican (la clave primaria lo impide)
    const removed = await prisma.visitLike.deleteMany({ where: { visitId: visit.id, userId: req.user.id } });
    const liked = removed.count === 0;
    if (liked) {
      await prisma.visitLike.upsert({
        where: { visitId_userId: { visitId: visit.id, userId: req.user.id } },
        create: { visitId: visit.id, userId: req.user.id },
        update: {},
      });
    }
    const likesCount = await prisma.visitLike.count({ where: { visitId: visit.id } });

    res.json({ liked, likesCount });
  } catch (error) {
    next(error);
  }
};

// Guardar: lista privada del usuario con las reseñas que quiere volver a ver
export const toggleSave = async (req, res, next) => {
  try {
    const visit = await findVisit(req.params.id, { select: { id: true, userId: true, hidden: true } });
    if (!visit || visit.hidden) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.userId === req.user.id) {
      return res.status(400).json({ message: 'No podés guardar tu propia reseña' });
    }

    const removed = await prisma.savedVisit.deleteMany({ where: { userId: req.user.id, visitId: visit.id } });
    const saved = removed.count === 0;
    if (saved) {
      await prisma.savedVisit.upsert({
        where: { userId_visitId: { userId: req.user.id, visitId: visit.id } },
        create: { userId: req.user.id, visitId: visit.id },
        update: {},
      });
    }

    res.json({ saved });
  } catch (error) {
    next(error);
  }
};

// Privadas: solo el usuario logueado ve sus guardadas, en el orden en que las guardó
export const getSavedVisits = async (req, res, next) => {
  try {
    const saved = await prisma.savedVisit.findMany({
      where: { userId: req.user.id, visit: NOT_HIDDEN },
      orderBy: { createdAt: 'asc' },
      include: { visit: { include: visitCardInclude } },
    });

    res.json(saved.map((row) => visitCard(row.visit)));
  } catch (error) {
    next(error);
  }
};

// Privadas: reseñas de otros a las que el usuario logueado les dio me gusta
export const getLikedVisits = async (req, res, next) => {
  try {
    const visits = await prisma.visit.findMany({
      where: { likes: { some: { userId: req.user.id } }, ...NOT_HIDDEN },
      include: visitCardInclude,
      orderBy: [{ visitDate: 'desc' }, { seq: 'asc' }],
    });
    res.json(visits.map(visitCard));
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
    const visit = await findVisit(req.params.id, { select: { id: true, userId: true, hidden: true } });
    if (!visit || visit.hidden) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.userId === req.user.id) {
      return res.status(400).json({ message: 'No podés denunciar tu propia reseña' });
    }

    try {
      await prisma.report.create({ data: { visitId: visit.id, reporterId: req.user.id, reason } });
    } catch (error) {
      if (error.code === 'P2002') {
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
    const reports = await prisma.report.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, username: true } },
        visit: {
          select: {
            id: true, reviewText: true, rating: true, visitDate: true,
            user: { select: { id: true, username: true } },
            stadium: { select: { id: true, name: true, mainClub: { select: { id: true, name: true, logoUrl: true } } } },
          },
        },
      },
    });
    // Reincidencia: cuántas denuncias (abiertas o ya resueltas) tienen en total las reseñas de cada autor
    const authorIds = [...new Set(reports.map((r) => r.visit?.user?.id).filter(Boolean))];
    const totals = authorIds.length
      ? await prisma.$queryRaw`
          SELECT v.user_id::text AS author, COUNT(*)::int AS n
          FROM reports r JOIN visits v ON v.id = r.visit_id
          WHERE v.user_id = ANY(${authorIds}::uuid[])
          GROUP BY v.user_id`
      : [];
    const byAuthor = new Map(totals.map((t) => [t.author, t.n]));

    const club = (c) => c && { _id: c.id, name: c.name, logoUrl: c.logoUrl };
    res.json(reports.map((r) => ({
      _id: r.id,
      visit: r.visit && {
        _id: r.visit.id,
        reviewText: r.visit.reviewText,
        rating: r.visit.rating,
        visitDate: r.visit.visitDate,
        user: r.visit.user && { _id: r.visit.user.id, username: r.visit.user.username },
        stadium: r.visit.stadium && { _id: r.visit.stadium.id, name: r.visit.stadium.name, mainClub: club(r.visit.stadium.mainClub) },
      },
      reporter: r.reporter && { _id: r.reporter.id, username: r.reporter.username },
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      authorReportCount: byAuthor.get(r.visit?.user?.id) ?? 0,
    })));
  } catch (error) {
    next(error);
  }
};

// Admin: todas las reseñas, con búsqueda y filtros, para moderar sin depender de las denuncias
export const adminListVisits = async (req, res, next) => {
  try {
    const limit = 15;
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const where = {};
    const min = Number(req.query.minRating);
    const max = Number(req.query.maxRating);
    if (min >= 1 || max <= 10) where.rating = { ...(min >= 1 && { gte: min }), ...(max <= 10 && { lte: max }) };
    if (req.query.hidden === 'true') where.hidden = true;
    if (req.query.hidden === 'false') where.hidden = false;
    if (q) {
      const text = { contains: escapeLike(q), mode: 'insensitive' };
      where.OR = [{ reviewText: text }, { user: { username: text } }, { stadium: { name: text } }];
    }

    const [items, total] = await Promise.all([
      prisma.visit.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, rating: true, reviewText: true, visitDate: true, createdAt: true, hidden: true, hiddenReason: true,
          _count: { select: { images: true, likes: true, reports: true } },
          user: { select: { id: true, username: true, avatarUrl: true, mutedUntil: true } },
          stadium: { select: { id: true, name: true, mainClub: { select: { name: true, logoUrl: true } } } },
        },
      }),
      prisma.visit.count({ where }),
    ]);
    res.json({
      items: items.map((v) => ({
        _id: v.id,
        rating: v.rating,
        reviewText: v.reviewText,
        visitDate: v.visitDate,
        createdAt: v.createdAt,
        hidden: v.hidden,
        hiddenReason: v.hiddenReason,
        imagesCount: v._count.images,
        likesCount: v._count.likes,
        reportCount: v._count.reports,
        user: { _id: v.user.id, username: v.user.username, avatarUrl: v.user.avatarUrl, mutedUntil: v.user.mutedUntil },
        stadium: { _id: v.stadium.id, name: v.stadium.name, clubLogoUrl: v.stadium.mainClub?.logoUrl, clubName: v.stadium.mainClub?.name },
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: oculta una reseña (con motivo) o la vuelve a mostrar. No borra nada.
export const setVisitHidden = async (req, res, next) => {
  try {
    const hidden = req.body?.hidden === true;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (hidden && (reason.length < 5 || reason.length > 300)) {
      return res.status(400).json({ message: 'El motivo debe tener entre 5 y 300 caracteres' });
    }
    const found = await findVisit(req.params.id, { select: { id: true } });
    if (!found) return res.status(404).json({ message: 'Visita no encontrada' });
    const visit = await prisma.visit.update({ where: { id: found.id }, data: { hidden, hiddenReason: hidden ? reason : '' } });
    logAudit(req.user, { action: 'update', entity: 'visit', entityId: visit.id, summary: hidden ? `Ocultó una reseña (motivo: ${reason})` : 'Volvió a mostrar una reseña', fields: ['hidden'] });
    res.json({ hidden: visit.hidden });
  } catch (error) {
    next(error);
  }
};

// Admin (y superadmin): borra cualquier reseña directamente, con motivo obligatorio (queda en la auditoría)
export const adminDeleteVisit = async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 300) {
      return res.status(400).json({ message: 'El motivo debe tener entre 5 y 300 caracteres' });
    }

    const visit = await findVisit(req.params.id, { include: { images: visitBaseInclude.images } });
    if (!visit) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }

    // Se van con la reseña (en cascada) sus fotos, likes, guardadas y denuncias
    await prisma.visit.delete({ where: { id: visit.id } });
    await destroyImages(visit.images.map((image) => image.url));

    logAudit(req.user, { action: 'delete', entity: 'visit', entityId: visit.id, summary: `Eliminó una reseña (motivo: ${reason})` });
    res.json({ message: 'Reseña eliminada' });
  } catch (error) {
    next(error);
  }
};

// Admin: descartar la denuncia o quitar la reseña (y con ella sus denuncias)
export const resolveReport = async (req, res, next) => {
  try {
    const { action } = req.body;
    const report = isId(req.params.id) ? await prisma.report.findUnique({ where: { id: req.params.id } }) : null;
    if (!report) {
      return res.status(404).json({ message: 'Denuncia no encontrada' });
    }

    if (action === 'remove_review') {
      const visit = await prisma.visit.findUnique({ where: { id: report.visitId }, include: { images: visitBaseInclude.images } });
      if (visit) {
        await prisma.visit.delete({ where: { id: visit.id } }); // arrastra sus denuncias, guardadas y likes
        await destroyImages(visit.images.map((image) => image.url));
      }
      logAudit(req.user, { action: 'resolve', entity: 'report', entityId: report.id, summary: 'Quitó una reseña denunciada' });
      return res.json({ message: 'Reseña eliminada' });
    }
    if (action === 'dismiss') {
      await prisma.report.update({ where: { id: report.id }, data: { status: 'resolved' } });
      logAudit(req.user, { action: 'resolve', entity: 'report', entityId: report.id, summary: 'Descartó una denuncia' });
      return res.json({ message: 'Denuncia descartada' });
    }
    return res.status(400).json({ message: 'Acción inválida' });
  } catch (error) {
    next(error);
  }
};
