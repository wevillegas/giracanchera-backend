import bcrypt from 'bcryptjs';
import { isText, escapeLike, textWithin, isCloudinaryUrl, isUsernameFormat, isEmailFormat, isPasswordFormat, isId } from '../utils/validation.js';
import prisma from '../config/prisma.js';
import { logAudit, diffChanges } from '../utils/audit.js';
import { destroyImages } from './visitController.js';
import { isValidClubRef, stadiumExists, userExists } from '../utils/refs.js';
import {
  accountJson, clubBadge, clubBadgeSelect, userListSelect, userListItem, locationOf, byText,
  followingIdsSelect, wishlistIdsSelect, savedIdsSelect, followingIds, wishlistIds, savedIds,
} from '../db/serialize.js';

// Usuario y email se guardan siempre en minúsculas (como hacía el esquema de Mongo)
export const normalizeLogin = (value) => value.trim().toLowerCase();
export const hashPassword = async (password) => bcrypt.hash(password, await bcrypt.genSalt(10));

// Borra la cuenta y todo lo que depende de ella: la base arrastra (en cascada) sus reseñas con sus fotos, likes y
// denuncias, a quién sigue y quién lo sigue, sus guardadas y "por visitar". Acá se borran las imágenes de Cloudinary.
// Lo usan tanto "borrar mi cuenta" como el borrado por un admin.
async function purgeUser(user) {
  const images = await prisma.visitImage.findMany({ where: { visit: { userId: user.id } }, select: { url: true } });
  await prisma.user.delete({ where: { id: user.id } });
  await destroyImages([...images.map((image) => image.url), user.avatarUrl].filter(Boolean));
}

// Estadios distintos que el usuario ya visitó (según sus reseñas reales en la BD)
async function getVisitStats(userId) {
  const stadiums = await prisma.stadium.findMany({
    where: { visits: { some: { userId } } },
    select: { id: true, name: true, imageUrl: true, city: true, province: true, country: true, lat: true, lng: true },
  });
  const visitedStadiums = stadiums.sort(byText('name')).map((s) => ({ _id: s.id, name: s.name, imageUrl: s.imageUrl, location: locationOf(s) }));
  return { visitedStadiums, visitedCount: visitedStadiums.length };
}

// Marca en cada usuario de una lista si ya sigue al que mira (followsViewer)
async function withFollowsViewer(users, viewerId) {
  const followsViewer = new Set(
    viewerId && users.length
      ? (await prisma.follow.findMany({ where: { followedId: viewerId, followerId: { in: users.map((u) => u.id) } }, select: { followerId: true } }))
        .map((f) => f.followerId)
      : [],
  );
  return users.map((u) => ({ ...userListItem(u), followsViewer: followsViewer.has(u.id) }));
}

// A quién sigue (en el orden en que lo siguió) y quién lo sigue (en el orden en que se registraron)
async function followLists(userId, viewerId) {
  const [following, followers] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, orderBy: { createdAt: 'asc' }, select: { followed: { select: userListSelect } } }),
    prisma.user.findMany({ where: { following: { some: { followedId: userId } } }, orderBy: { seq: 'asc' }, select: userListSelect }),
  ]);
  const [followingWithFlag, followersWithFlag] = await Promise.all([
    withFollowsViewer(following.map((f) => f.followed), viewerId),
    withFollowsViewer(followers, viewerId),
  ]);
  return { following: followingWithFlag, followers: followersWithFlag, followersCount: followers.length };
}

// Estadios "por visitar" en el orden en que se agregaron, con los campos pedidos
const wishlistStadiums = async (userId, select) => {
  const rows = await prisma.wishlist.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { stadium: { select } } });
  return rows.map((r) => r.stadium);
};
const stadiumLocationSelect = { id: true, name: true, city: true, province: true, country: true, lat: true, lng: true };

export const getProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      omit: { password: true },
      include: { clubHincha: { select: clubBadgeSelect }, ...savedIdsSelect },
    });
    const [wanted, lists, visitStats] = await Promise.all([
      wishlistStadiums(user.id, { ...stadiumLocationSelect, imageUrl: true, capacity: true, mainClubId: true }),
      followLists(user.id, user.id),
      getVisitStats(user.id),
    ]);

    res.json({
      ...accountJson(user, {
        clubHincha: clubBadge(user.clubHincha),
        following: lists.following,
        wantToVisit: wanted.map((s) => ({ _id: s.id, name: s.name, imageUrl: s.imageUrl, location: locationOf(s), capacity: s.capacity, mainClub: s.mainClubId })),
        savedVisits: savedIds(user),
      }),
      followers: lists.followers,
      followersCount: lists.followersCount,
      ...visitStats,
    });
  } catch (error) {
    next(error);
  }
};

// Cuenta con sus listas como ids (respuesta de las ediciones, como el documento de Mongo sin poblar)
const accountInclude = (clubSelect) => ({ clubHincha: { select: clubSelect }, ...followingIdsSelect, ...wishlistIdsSelect, ...savedIdsSelect });
const accountWithIds = (user) => accountJson(user, {
  clubHincha: user.clubHincha ? { _id: user.clubHincha.id, ...Object.fromEntries(Object.entries(user.clubHincha).filter(([k]) => k !== 'id')) } : null,
  following: followingIds(user),
  wantToVisit: wishlistIds(user),
  savedVisits: savedIds(user),
});

export const updateProfile = async (req, res, next) => {
  try {
    const { nombre, bio, avatarUrl, clubHincha } = req.body;
    const updates = {};

    if (nombre !== undefined) {
      if (!textWithin(nombre, 80)) {
        return res.status(400).json({ message: 'El nombre debe ser texto de hasta 80 caracteres' });
      }
      updates.nombre = nombre.trim();
    }

    if (bio !== undefined) {
      if (!textWithin(bio, 300)) {
        return res.status(400).json({ message: 'La bio debe ser texto de hasta 300 caracteres' });
      }
      updates.bio = bio.trim();
    }

    if (avatarUrl !== undefined) {
      if (!isText(avatarUrl) || !isCloudinaryUrl(avatarUrl.trim())) {
        return res.status(400).json({ message: 'avatarUrl debe ser una URL de Cloudinary' });
      }
      updates.avatarUrl = avatarUrl.trim();
    }

    if (req.file) {
      updates.avatarUrl = req.file.path;
    }

    if (clubHincha !== undefined) {
      if (!(await isValidClubRef(clubHincha))) {
        if (req.file) await destroyImages([req.file.path]);
        return res.status(400).json({ message: 'El club elegido no existe' });
      }
      updates.clubHinchaId = clubHincha || null;
    }

    const previousAvatar = updates.avatarUrl && updates.avatarUrl !== req.user.avatarUrl ? req.user.avatarUrl : '';
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
      omit: { password: true },
      include: accountInclude(clubBadgeSelect),
    });

    if (previousAvatar) await destroyImages([previousAvatar]);
    const fields = Object.keys(updates).map((key) => (key === 'clubHinchaId' ? 'clubHincha' : key));
    logAudit(req.user, { action: 'update', entity: 'user', entityId: user.id, summary: `Editó su perfil @${user.username}`, fields });
    res.json(accountWithIds(user));
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const raw = req.query.username;
    if (!isText(raw)) return res.json([]);
    // Texto literal, acotado
    const q = raw.trim().slice(0, 50);
    if (!q) return res.json([]);

    const users = await prisma.user.findMany({
      where: { username: { contains: escapeLike(q), mode: 'insensitive' }, id: { not: req.user.id } },
      select: { id: true, username: true, avatarUrl: true, nombre: true },
      orderBy: { seq: 'asc' },
      take: 10,
    });

    res.json(users.map((u) => ({ _id: u.id, username: u.username, avatarUrl: u.avatarUrl, nombre: u.nombre })));
  } catch (error) {
    next(error);
  }
};

// Perfil que cualquiera puede ver: sin email, guardadas, rol ni datos de sesión
export const getPublicProfile = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Datos inválidos' });
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, username: true, nombre: true, avatarUrl: true, bio: true, fechaNacimiento: true, createdAt: true,
        clubHincha: { select: clubBadgeSelect },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const [wanted, lists, visitStats] = await Promise.all([
      wishlistStadiums(user.id, { ...stadiumLocationSelect, imageUrl: true }),
      followLists(user.id, req.user?.id),
      getVisitStats(user.id),
    ]);

    res.json({
      _id: user.id,
      nombre: user.nombre,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      fechaNacimiento: user.fechaNacimiento,
      clubHincha: clubBadge(user.clubHincha),
      following: lists.following,
      wantToVisit: wanted.map((s) => ({ _id: s.id, name: s.name, imageUrl: s.imageUrl, location: locationOf(s) })),
      createdAt: user.createdAt,
      followers: lists.followers,
      followersCount: lists.followersCount,
      ...visitStats,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleWantToVisit = async (req, res, next) => {
  try {
    const { stadiumId } = req.params;
    if (!(await stadiumExists(stadiumId))) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    const removed = await prisma.wishlist.deleteMany({ where: { userId: req.user.id, stadiumId } });
    if (removed.count === 0) {
      await prisma.wishlist.upsert({
        where: { userId_stadiumId: { userId: req.user.id, stadiumId } },
        create: { userId: req.user.id, stadiumId },
        update: {},
      });
    }
    const rows = await prisma.wishlist.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'asc' }, select: { stadiumId: true } });
    res.json({ wantToVisit: rows.map((r) => r.stadiumId) });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      omit: { password: true },
      include: { clubHincha: { select: clubBadgeSelect }, ...followingIdsSelect, ...wishlistIdsSelect },
      orderBy: [{ createdAt: 'desc' }, { seq: 'asc' }],
    });

    res.json(users.map((u) => accountJson(u, {
      clubHincha: clubBadge(u.clubHincha), following: followingIds(u), wantToVisit: wishlistIds(u), withSession: false,
    })));
  } catch (error) {
    next(error);
  }
};

// Admin: resumen de la actividad de un usuario para decidir si hace falta moderarlo
export const adminUserActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: 'Usuario inválido' });
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, createdAt: true, rol: true, mutedUntil: true } });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const [visits, hidden, reportsMade, reportsReceived, lastVisits, rating] = await Promise.all([
      prisma.visit.count({ where: { userId: id } }),
      prisma.visit.count({ where: { userId: id, hidden: true } }),
      prisma.report.count({ where: { reporterId: id } }),
      prisma.report.count({ where: { visit: { userId: id } } }),
      prisma.visit.findMany({
        where: { userId: id },
        orderBy: [{ createdAt: 'desc' }, { seq: 'asc' }],
        take: 5,
        select: { id: true, rating: true, reviewText: true, hidden: true, createdAt: true, stadium: { select: { id: true, name: true } } },
      }),
      prisma.visit.aggregate({ where: { userId: id }, _avg: { rating: true } }),
    ]);

    res.json({
      user: { _id: user.id, username: user.username, createdAt: user.createdAt, rol: user.rol, mutedUntil: user.mutedUntil },
      visits,
      hidden,
      reportsMade,
      reportsReceived,
      avgRating: rating._avg.rating === null ? null : Number(rating._avg.rating.toFixed(1)),
      lastVisits: lastVisits.map((v) => ({
        _id: v.id, rating: v.rating, reviewText: v.reviewText, hidden: v.hidden, createdAt: v.createdAt,
        stadium: v.stadium && { _id: v.stadium.id, name: v.stadium.name },
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const adminUpdateUser = async (req, res, next) => {
  try {
    const { nombre, username, email, rol, bio, clubHincha, mutedDays } = req.body;
    const updates = {}; // en los nombres de la API (para la auditoría)
    let bumpSession = false;

    const isSuper = req.user.rol === 'superadmin';
    const isSelf = req.params.id === req.user.id;

    const target = isId(req.params.id)
      ? await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { nombre: true, username: true, email: true, rol: true, bio: true, clubHinchaId: true, mutedUntil: true },
      })
      : null;
    if (!target) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    // Un admin no toca a otro admin ni a un superadmin; el superadmin puede tocar a cualquiera
    if (!isSuper && !isSelf && target.rol === 'admin') {
      return res.status(403).json({ message: 'No podés modificar a otro administrador' });
    }
    // Un superadmin no modifica a otro superadmin (sí a sí mismo)
    if (target.rol === 'superadmin' && !isSelf) {
      return res.status(403).json({ message: 'No podés modificar a otro superadministrador' });
    }

    // Nadie puede quitarse a sí mismo el rol (evita dejar la app sin administradores desde la propia cuenta)
    if (rol !== undefined && rol !== req.user.rol && isSelf) {
      return res.status(400).json({ message: 'No podés cambiar tu propio rol' });
    }

    if (nombre !== undefined) {
      if (!textWithin(nombre, 80)) return res.status(400).json({ message: 'El nombre debe ser texto de hasta 80 caracteres' });
      updates.nombre = nombre.trim();
    }
    if (username !== undefined) {
      if (!isUsernameFormat(username)) {
        return res.status(400).json({ message: 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo' });
      }
      updates.username = normalizeLogin(username);
    }
    if (email !== undefined) {
      if (!isEmailFormat(email)) {
        return res.status(400).json({ message: 'El email no es válido' });
      }
      updates.email = normalizeLogin(email);
    }
    if (bio !== undefined) {
      if (!textWithin(bio, 300)) return res.status(400).json({ message: 'La bio debe ser texto de hasta 300 caracteres' });
      updates.bio = bio.trim();
    }
    if (rol !== undefined) {
      if (!['user', 'admin', 'superadmin'].includes(rol)) {
        return res.status(400).json({ message: 'rol inválido' });
      }
      if (rol === 'superadmin' && !isSuper) {
        return res.status(403).json({ message: 'Solo el superadministrador puede asignar ese rol' });
      }
      updates.rol = rol;
      // Cambio de rol: las sesiones abiertas de ese usuario se reinician
      if (rol !== target.rol) bumpSession = true;
    }
    if (clubHincha !== undefined) {
      if (!(await isValidClubRef(clubHincha))) return res.status(400).json({ message: 'El club elegido no existe' });
      updates.clubHincha = clubHincha || null;
    }
    // Silenciar: cantidad de días desde ahora (0 levanta la sanción)
    if (mutedDays !== undefined) {
      const days = Number(mutedDays);
      if (!Number.isInteger(days) || days < 0 || days > 365) return res.status(400).json({ message: 'Los días de silencio deben ser un número entre 0 y 365' });
      if (isSelf) return res.status(400).json({ message: 'No podés silenciar tu propia cuenta' });
      updates.mutedUntil = days === 0 ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const { clubHincha: club, ...columns } = updates;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...columns,
        ...(club !== undefined && { clubHinchaId: club }),
        ...(bumpSession && { tokenVersion: { increment: 1 } }),
      },
      omit: { password: true },
      include: accountInclude({ id: true, name: true }),
    });

    const before = { ...target, clubHincha: target.clubHinchaId };
    logAudit(req.user, { action: 'update', entity: 'user', entityId: user.id, summary: `Editó al usuario @${user.username}`, fields: Object.keys(updates), changes: diffChanges(before, updates) });
    res.json(accountWithIds(user));
  } catch (error) {
    next(error);
  }
};

export const adminDeleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ message: 'No podés eliminar tu propia cuenta' });
    }

    const target = isId(id) ? await prisma.user.findUnique({ where: { id }, select: { id: true, rol: true, username: true, avatarUrl: true } }) : null;
    if (!target) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    // Un superadmin nunca se elimina desde la API; un admin no elimina a otro admin
    if (target.rol === 'superadmin') {
      return res.status(403).json({ message: 'No se puede eliminar a un superadministrador' });
    }
    if (target.rol === 'admin' && req.user.rol !== 'superadmin') {
      return res.status(403).json({ message: 'No podés eliminar a otro administrador' });
    }

    await purgeUser(target);

    logAudit(req.user, { action: 'delete', entity: 'user', entityId: id, summary: `Eliminó al usuario @${target.username}` });
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
};

export const toggleFollow = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const me = req.user.id;

    if (userId === me) {
      return res.status(400).json({ message: 'No podés seguirte a vos mismo' });
    }

    if (!(await userExists(userId))) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const removed = await prisma.follow.deleteMany({ where: { followerId: me, followedId: userId } });
    if (removed.count === 0) {
      await prisma.follow.upsert({
        where: { followerId_followedId: { followerId: me, followedId: userId } },
        create: { followerId: me, followedId: userId },
        update: {},
      });
    }
    const rows = await prisma.follow.findMany({ where: { followerId: me }, orderBy: { createdAt: 'asc' }, select: { followedId: true } });
    res.json({ following: rows.map((r) => r.followedId) });
  } catch (error) {
    next(error);
  }
};

// El propio usuario borra su cuenta y sus datos; pide la contraseña como confirmación
export const deleteMe = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!isText(password)) {
      return res.status(400).json({ message: 'Ingresá tu contraseña para confirmar' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'La contraseña no es correcta' });
    }

    await purgeUser(user);

    logAudit(user, { action: 'delete', entity: 'user', entityId: user.id, summary: `Eliminó su cuenta @${user.username}` });
    res.json({ message: 'Cuenta eliminada' });
  } catch (error) {
    next(error);
  }
};

// Cambio de contraseña provisorio desde "editar perfil", hasta que exista confirmación por mail
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!isText(currentPassword) || !isText(newPassword)) {
      return res.status(400).json({ message: 'Completá tu contraseña actual y la nueva' });
    }
    if (!isPasswordFormat(newPassword)) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener entre 8 y 128 caracteres, con al menos una letra y un número' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta' });
    }

    // Cierra las demás sesiones: un token robado deja de valer al cambiar la clave
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
    });

    logAudit(user, { action: 'update', entity: 'user', entityId: user.id, summary: `Cambió su contraseña @${user.username}` });
    res.json({ message: 'Contraseña actualizada' });
  } catch (error) {
    next(error);
  }
};

const EXPENSE_FIELDS = ['ticket', 'food', 'parking', 'transport'];
const EXPENSE_COLUMN = { ticket: 'expenseTicket', food: 'expenseFood', parking: 'expenseParking', transport: 'expenseTransport' };
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

// Estadísticas personales: solo el propio usuario las ve (se calculan con sus visitas)
export const getMyStats = async (req, res, next) => {
  try {
    const visits = await prisma.visit.findMany({
      where: { userId: req.user.id },
      // Mismo recorrido que hacía Mongo (por su índice: de la más nueva a la más vieja): decide los empates del favorito y del mes
      orderBy: [{ createdAt: 'desc' }, { seq: 'asc' }],
      select: {
        stadiumId: true, rating: true, visitDate: true, homeTeam: true, awayTeam: true,
        expenseTicket: true, expenseFood: true, expenseParking: true, expenseTransport: true,
        stadium: { select: { name: true, city: true, province: true, country: true, capacity: true, imageUrl: true, mainClub: { select: { name: true, logoUrl: true } } } },
      },
    });

    const stadiumCounts = new Map();
    const monthCounts = new Map();
    const spendByField = Object.fromEntries(EXPENSE_FIELDS.map((f) => [f, 0]));
    let ratingSum = 0;
    let matches = 0;
    let spentVisits = 0;
    let totalSpent = 0;

    for (const v of visits) {
      const current = stadiumCounts.get(v.stadiumId) || { name: v.stadium?.name || 'Estadio', visits: 0, doc: v.stadium };
      current.visits += 1;
      stadiumCounts.set(v.stadiumId, current);

      const month = monthKey(new Date(v.visitDate));
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);

      ratingSum += v.rating;
      if (v.homeTeam || v.awayTeam) matches += 1;

      const visitTotal = EXPENSE_FIELDS.reduce((sum, f) => sum + (v[EXPENSE_COLUMN[f]] || 0), 0);
      if (visitTotal > 0) spentVisits += 1;
      totalSpent += visitTotal;
      EXPENSE_FIELDS.forEach((f) => { spendByField[f] += v[EXPENSE_COLUMN[f]] || 0; });
    }

    const favorite = [...stadiumCounts.values()].sort((a, b) => b.visits - a.visits)[0] || null;

    // Partidos de su club de hincha (según el partido cargado en cada visita)
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { clubHincha: { select: { name: true } } } });
    const clubName = me?.clubHincha?.name || '';
    const clubMatches = clubName
      ? { clubName, count: visits.filter((v) => v.homeTeam === clubName || v.awayTeam === clubName).length }
      : null;

    const topMonth = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    res.json({
      clubMatches,
      visits: visits.length,
      stadiums: stadiumCounts.size,
      avgRating: visits.length ? Math.round((ratingSum / visits.length) * 10) / 10 : 0,
      totalSpent,
      avgSpent: spentVisits ? Math.round(totalSpent / spentVisits) : 0,
      spendByField,
      matches,
      favoriteStadium: favorite ? {
        name: favorite.name,
        visits: favorite.visits,
        city: favorite.doc?.city || '',
        province: favorite.doc?.province || '',
        country: favorite.doc?.country || '',
        capacity: favorite.doc?.capacity ?? null,
        imageUrl: favorite.doc?.imageUrl || '',
        clubName: favorite.doc?.mainClub?.name || '',
        clubLogoUrl: favorite.doc?.mainClub?.logoUrl || '',
      } : null,
      topMonth: topMonth ? { month: topMonth[0], visits: topMonth[1] } : null,
    });
  } catch (error) {
    next(error);
  }
};
