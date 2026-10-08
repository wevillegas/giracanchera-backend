import { isText, escapeRegex, textWithin, isCloudinaryUrl, isUsernameFormat, isEmailFormat } from '../utils/validation.js';
import User from '../models/User.js';
import Visit from '../models/Visit.js';
import Stadium from '../models/Stadium.js';
import Report from '../models/Report.js';
import { logAudit } from '../utils/audit.js';
import { destroyImages } from './visitController.js';

// Estadios distintos que el usuario ya visitó (según sus reseñas reales en la BD)
async function getVisitStats(userId) {
  const visitedStadiumIds = await Visit.distinct('stadium', { user: userId });

  const visitedStadiums = await Stadium.find({ _id: { $in: visitedStadiumIds } })
    .select('name imageUrl location')
    .sort({ name: 1 });

  return { visitedStadiums, visitedCount: visitedStadiums.length };
}

// Escudo del club de hincha que se muestra junto a la foto en listas de usuarios
const CLUB_BADGE = { path: 'clubHincha', select: 'name logoUrl' };

// Marca en cada usuario de una lista si ya sigue al que mira (followsViewer)
const withFollowsViewer = async (users, viewerId) => {
  const plain = users.filter(Boolean).map((u) => (u.toObject ? u.toObject() : u));
  const followingViewer = new Set(
    viewerId ? (await User.find({ _id: { $in: plain.map((u) => u._id) }, following: viewerId }).distinct('_id')).map(String) : []
  );
  return plain.map((u) => ({ ...u, followsViewer: followingViewer.has(String(u._id)) }));
};

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('clubHincha', 'name logoUrl')
      .populate('wantToVisit', 'name imageUrl location capacity mainClub')
      .populate({ path: 'following', select: 'username avatarUrl bio clubHincha', populate: CLUB_BADGE });

    const [followers, visitStats] = await Promise.all([
      User.find({ following: req.user._id }).select('username avatarUrl bio clubHincha').populate(CLUB_BADGE),
      getVisitStats(req.user._id),
    ]);

    const viewerId = req.user._id;
    const [followersWithFlag, followingWithFlag] = await Promise.all([
      withFollowsViewer(followers, viewerId),
      withFollowsViewer(user.following, viewerId),
    ]);

    res.json({
      ...user.toJSON(),
      following: followingWithFlag,
      followers: followersWithFlag,
      followersCount: followers.length,
      ...visitStats,
    });
  } catch (error) {
    next(error);
  }
};

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
      if (!isCloudinaryUrl(avatarUrl.trim())) {
        return res.status(400).json({ message: 'avatarUrl debe ser una URL de Cloudinary' });
      }
      updates.avatarUrl = avatarUrl.trim();
    }

    if (req.file) {
      updates.avatarUrl = req.file.path;
    }

    if (clubHincha !== undefined) {
      updates.clubHincha = clubHincha || null;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    })
      .select('-password')
      .populate('clubHincha', 'name logoUrl');

    logAudit(req.user, { action: 'update', entity: 'user', entityId: user._id, summary: `Editó su perfil @${user.username}`, fields: Object.keys(updates) });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const raw = req.query.username;
    if (!isText(raw)) return res.json([]);
    // Texto literal, acotado: sin regex del usuario
    const q = raw.trim().slice(0, 50);
    if (!q) return res.json([]);

    const users = await User.find({
      username: { $regex: escapeRegex(q), $options: 'i' },
      _id: { $ne: req.user._id },
    })
      .select('username avatarUrl nombre')
      .limit(10);

    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const getPublicProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-email')
      .populate('clubHincha', 'name shortName logoUrl')
      .populate({ path: 'following', select: 'username avatarUrl bio clubHincha', populate: CLUB_BADGE })
      .populate('wantToVisit', 'name location imageUrl');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const [followers, visitStats] = await Promise.all([
      User.find({ following: req.params.id }).select('username avatarUrl bio clubHincha').populate(CLUB_BADGE),
      getVisitStats(req.params.id),
    ]);

    const viewerId = req.user?._id;
    const [followersWithFlag, followingWithFlag] = await Promise.all([
      withFollowsViewer(followers, viewerId),
      withFollowsViewer(user.following, viewerId),
    ]);

    res.json({
      ...user.toJSON(),
      following: followingWithFlag,
      followers: followersWithFlag,
      followersCount: followers.length,
      ...visitStats,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleWantToVisit = async (req, res, next) => {
  try {
    const { stadiumId } = req.params;
    const user = req.user;

    const index = user.wantToVisit.findIndex((id) => id.toString() === stadiumId);

    if (index === -1) {
      user.wantToVisit.push(stadiumId);
    } else {
      user.wantToVisit.splice(index, 1);
    }

    await user.save();
    res.json({ wantToVisit: user.wantToVisit });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('clubHincha', 'name shortName logoUrl')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const adminUpdateUser = async (req, res, next) => {
  try {
    const { nombre, username, email, rol, bio, clubHincha } = req.body;
    const updates = {};

    const isSuper = req.user.rol === 'superadmin';
    const isSelf = req.params.id === req.user._id.toString();

    const target = await User.findById(req.params.id).select('rol');
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

    if (nombre !== undefined) updates.nombre = nombre.trim();
    if (username !== undefined) {
      if (!isUsernameFormat(username)) {
        return res.status(400).json({ message: 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo' });
      }
      updates.username = username.trim();
    }
    if (email !== undefined) {
      if (!isEmailFormat(email)) {
        return res.status(400).json({ message: 'El email no es válido' });
      }
      updates.email = email.trim();
    }
    if (bio !== undefined) updates.bio = bio.trim();
    if (rol !== undefined) {
      if (!['user', 'admin', 'superadmin'].includes(rol)) {
        return res.status(400).json({ message: 'rol inválido' });
      }
      if (rol === 'superadmin' && !isSuper) {
        return res.status(403).json({ message: 'Solo el superadministrador puede asignar ese rol' });
      }
      updates.rol = rol;
    }
    if (clubHincha !== undefined) updates.clubHincha = clubHincha || null;

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
      .select('-password')
      .populate('clubHincha', 'name shortName');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    logAudit(req.user, { action: 'update', entity: 'user', entityId: user._id, summary: `Editó al usuario @${user.username}`, fields: Object.keys(updates) });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const adminDeleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'No podés eliminar tu propia cuenta' });
    }

    const target = await User.findById(id).select('rol username');
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

    await User.findByIdAndDelete(id);

    await Visit.deleteMany({ user: id });
    await User.updateMany({ following: id }, { $pull: { following: id } });

    logAudit(req.user, { action: 'delete', entity: 'user', entityId: id, summary: `Eliminó al usuario @${target.username}` });
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
};

export const toggleFollow = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = req.user;

    if (userId === user._id.toString()) {
      return res.status(400).json({ message: 'No podés seguirte a vos mismo' });
    }

    const target = await User.findById(userId);
    if (!target) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const index = user.following.findIndex((id) => id.toString() === userId);
    if (index === -1) {
      user.following.push(userId);
    } else {
      user.following.splice(index, 1);
    }

    await user.save();
    res.json({ following: user.following });
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
    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'La contraseña no es correcta' });
    }

    const visits = await Visit.find({ user: user._id }).select('images');
    await destroyImages(visits.flatMap((visit) => visit.images));
    await Visit.deleteMany({ user: user._id });
    await Report.deleteMany({ reporter: user._id });
    await Visit.updateMany({ likes: user._id }, { $pull: { likes: user._id } });
    await User.updateMany({ following: user._id }, { $pull: { following: user._id } });
    await user.deleteOne();

    logAudit(user, { action: 'delete', entity: 'user', entityId: user._id, summary: `Eliminó su cuenta @${user.username}` });
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
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta' });
    }

    user.password = newPassword;
    await user.save();

    logAudit(user, { action: 'update', entity: 'user', entityId: user._id, summary: `Cambió su contraseña @${user.username}` });
    res.json({ message: 'Contraseña actualizada' });
  } catch (error) {
    next(error);
  }
};

const EXPENSE_FIELDS = ['ticket', 'food', 'parking', 'transport'];
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

// Estadísticas personales: solo el propio usuario las ve (se calculan con sus visitas)
export const getMyStats = async (req, res, next) => {
  try {
    const visits = await Visit.find({ user: req.user._id })
      .select('stadium rating visitDate expenses matchDetails')
      .populate({
        path: 'stadium',
        select: 'name location capacity imageUrl mainClub',
        populate: { path: 'mainClub', select: 'name logoUrl' },
      });

    const stadiumCounts = new Map();
    const stadiumData = new Map();
    const monthCounts = new Map();
    const spendByField = Object.fromEntries(EXPENSE_FIELDS.map((f) => [f, 0]));
    let ratingSum = 0;
    let matches = 0;
    let spentVisits = 0;
    let totalSpent = 0;

    for (const v of visits) {
      const stadiumId = String(v.stadium?._id || v.stadium);
      const current = stadiumCounts.get(stadiumId) || { name: v.stadium?.name || 'Estadio', visits: 0 };
      current.visits += 1;
      stadiumCounts.set(stadiumId, current);
      if (v.stadium?._id && !stadiumData.has(stadiumId)) stadiumData.set(stadiumId, v.stadium);

      const month = monthKey(new Date(v.visitDate));
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);

      ratingSum += v.rating;
      if (v.matchDetails?.homeTeam || v.matchDetails?.awayTeam) matches += 1;

      const visitTotal = EXPENSE_FIELDS.reduce((sum, f) => sum + (v.expenses?.[f] || 0), 0);
      if (visitTotal > 0) spentVisits += 1;
      totalSpent += visitTotal;
      EXPENSE_FIELDS.forEach((f) => { spendByField[f] += v.expenses?.[f] || 0; });
    }

    const [favoriteId, favoriteCount] = [...stadiumCounts.entries()].sort((a, b) => b[1].visits - a[1].visits)[0] || [];
    const favorite = favoriteCount ? { ...favoriteCount, doc: stadiumData.get(favoriteId) } : null;

    // Partidos de su club de hincha (según el partido cargado en cada visita)
    const me = await User.findById(req.user._id).select('clubHincha').populate('clubHincha', 'name');
    const clubName = me?.clubHincha?.name || '';
    const clubMatches = clubName
      ? { clubName, count: visits.filter((v) => v.matchDetails?.homeTeam === clubName || v.matchDetails?.awayTeam === clubName).length }
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
        city: favorite.doc?.location?.city || '',
        province: favorite.doc?.location?.province || '',
        country: favorite.doc?.location?.country || '',
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
