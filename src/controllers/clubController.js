import Club from '../models/Club.js';

export const getClubs = async (req, res, next) => {
  try {
    const clubs = await Club.find().sort({ name: 1 });
    res.json(clubs);
  } catch (error) {
    next(error);
  }
};

export const createClub = async (req, res, next) => {
  try {
    const club = await Club.create(req.body);
    res.status(201).json(club);
  } catch (error) {
    next(error);
  }
};
