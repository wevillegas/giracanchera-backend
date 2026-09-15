import User from '../models/User.js';

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('clubHincha', 'name logoUrl')
      .populate('wantToVisit', 'name imageUrl location capacity mainClub');

    res.json(user);
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

export const getPublicProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-email')
      .populate('clubHincha', 'name shortName logoUrl')
      .populate('friends', 'username avatarUrl')
      .populate('wantToVisit', 'name location imageUrl');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(user);
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

export const addFriend = async (req, res, next) => {
  try {
    const { friendId } = req.params;
    const user = req.user;

    if (friendId === user._id.toString()) {
      return res.status(400).json({ message: 'No podés agregarte a vos mismo' });
    }

    const friend = await User.findById(friendId);
    if (!friend) {
      return res.status(404).json({ message: 'Usuario a agregar no encontrado' });
    }

    if (!user.friends.some((id) => id.toString() === friendId)) {
      user.friends.push(friendId);
      await user.save();
    }

    res.json({ friends: user.friends });
  } catch (error) {
    next(error);
  }
};
