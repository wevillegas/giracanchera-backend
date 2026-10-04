import { isText, escapeRegex, textWithin } from '../utils/validation.js';
import User from '../models/User.js';
import Visit from '../models/Visit.js';
import Stadium from '../models/Stadium.js';
import Report from '../models/Report.js';
import { destroyImages } from './visitController.js';

// Estadios distintos que el usuario ya visitó (según sus reseñas reales en la BD)
async function getVisitStats(userId) {
  const visitedStadiumIds = await Visit.distinct('stadium', { user: userId });

  const visitedStadiums = await Stadium.find({ _id: { $in: visitedStadiumIds } })
    .select('name imageUrl location')
    .sort({ name: 1 });

  return { visitedStadiums, visitedCount: visitedStadiums.length };
}

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('clubHincha', 'name logoUrl')
      .populate('wantToVisit', 'name imageUrl location capacity mainClub')
      .populate('following', 'username avatarUrl');

    const [followers, visitStats] = await Promise.all([
      User.find({ following: req.user._id }).select('username avatarUrl'),
      getVisitStats(req.user._id),
    ]);

    res.json({ ...user.toJSON(), followers, followersCount: followers.length, ...visitStats });
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
      if (!textWithin(avatarUrl, 500)) {
        return res.status(400).json({ message: 'avatarUrl debe ser texto' });
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
      .populate('following', 'username avatarUrl')
      .populate('wantToVisit', 'name location imageUrl');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const [followers, visitStats] = await Promise.all([
      User.find({ following: req.params.id }).select('username avatarUrl'),
      getVisitStats(req.params.id),
    ]);

    res.json({ ...user.toJSON(), followers, followersCount: followers.length, ...visitStats });
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

    // Un admin no puede quitarse a sí mismo el rol (evita dejar la app sin administradores desde la propia cuenta)
    if (rol !== undefined && rol !== 'admin' && req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'No podés quitarte tu propio rol de administrador' });
    }

    if (nombre !== undefined) updates.nombre = nombre.trim();
    if (username !== undefined) updates.username = username.trim();
    if (email !== undefined) updates.email = email.trim();
    if (bio !== undefined) updates.bio = bio.trim();
    if (rol !== undefined) {
      if (!['user', 'admin'].includes(rol)) {
        return res.status(400).json({ message: 'rol inválido' });
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

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    await Visit.deleteMany({ user: id });
    await User.updateMany({ following: id }, { $pull: { following: id } });

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

    res.json({ message: 'Cuenta eliminada' });
  } catch (error) {
    next(error);
  }
};

// Reemplaza la lista de visitas anteriores del usuario (cada estadio aparece una vez)
export const setPreviousVisits = async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length > 200) {
      return res.status(400).json({ message: 'Formato de visitas anteriores inválido' });
    }

    const seen = new Set();
    const clean = [];
    for (const item of items) {
      const count = Number(item?.count);
      if (!isText(item?.stadium) || !Number.isInteger(count) || count < 1 || count > 999) {
        return res.status(400).json({ message: 'Cada estadio necesita una cantidad de visitas entre 1 y 999' });
      }
      if (seen.has(item.stadium)) {
        return res.status(400).json({ message: 'Un estadio aparece repetido en las visitas anteriores' });
      }
      seen.add(item.stadium);
      clean.push({ stadium: item.stadium, count });
    }

    const user = await User.findByIdAndUpdate(req.user._id, { previousVisits: clean }, { new: true, runValidators: true });
    res.json({ previousVisits: user.previousVisits });
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
    const me = await User.findById(req.user._id).select('previousVisits clubHincha').populate('clubHincha', 'name');
    const clubName = me?.clubHincha?.name || '';
    const clubMatches = clubName
      ? { clubName, count: visits.filter((v) => v.matchDetails?.homeTeam === clubName || v.matchDetails?.awayTeam === clubName).length }
      : null;

    // Visitas anteriores a la app: cargadas por el usuario, separadas de las reseñas
    const previousStadiums = await Stadium.find({ _id: { $in: (me?.previousVisits || []).map((p) => p.stadium) } })
      .select('name location');
    const previousNames = new Map(previousStadiums.map((s) => [String(s._id), s]));
    const previousItems = (me?.previousVisits || []).map((p) => {
      const s = previousNames.get(String(p.stadium));
      return {
        stadiumId: String(p.stadium),
        name: s?.name || 'Estadio',
        province: s?.location?.province || s?.location?.city || '',
        count: p.count,
      };
    });
    const previous = { total: previousItems.reduce((sum, p) => sum + p.count, 0), items: previousItems };
    const topMonth = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    res.json({
      clubMatches,
      previous,
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
