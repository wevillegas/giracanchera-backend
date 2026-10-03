import Stadium from '../models/Stadium.js';
import Visit from '../models/Visit.js';
import User from '../models/User.js';

export const getStadiums = async (req, res, next) => {
  try {
    const stadiums = await Stadium.find().populate('mainClub', 'name shortName logoUrl');
    res.json(stadiums);
  } catch (error) {
    next(error);
  }
};

export const createStadium = async (req, res, next) => {
  try {
    const stadium = await Stadium.create(req.body);
    res.status(201).json(stadium);
  } catch (error) {
    next(error);
  }
};

export const updateStadium = async (req, res, next) => {
  try {
    const stadium = await Stadium.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('mainClub', 'name shortName logoUrl');

    if (!stadium) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

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

    await Visit.deleteMany({ stadium: id });
    await User.updateMany({ wantToVisit: id }, { $pull: { wantToVisit: id } });

    res.json({ message: 'Estadio eliminado' });
  } catch (error) {
    next(error);
  }
};

export const getStadiumById = async (req, res, next) => {
  try {
    const stadium = await Stadium.findById(req.params.id).populate(
      'mainClub',
      'name shortName logoUrl'
    );

    if (!stadium) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    const visits = await Visit.find({ stadium: stadium._id })
      .populate('user', 'username avatarUrl')
      .sort({ visitDate: -1 });

    res.json({ stadium, visits });
  } catch (error) {
    next(error);
  }
};
