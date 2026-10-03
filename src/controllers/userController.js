import User from '../models/User.js';
import Visit from '../models/Visit.js';
import Stadium from '../models/Stadium.js';

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
      if (typeof nombre !== 'string') {
        return res.status(400).json({ message: 'nombre debe ser texto' });
      }
      updates.nombre = nombre.trim();
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string') {
        return res.status(400).json({ message: 'bio debe ser texto' });
      }
      updates.bio = bio.trim();
    }

    if (avatarUrl !== undefined) {
      if (typeof avatarUrl !== 'string') {
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
    const q = (req.query.username || '').trim();
    if (!q) return res.json([]);

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
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
      .populate('clubHincha', 'name shortName')
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
