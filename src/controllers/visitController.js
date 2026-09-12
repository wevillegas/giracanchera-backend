import Visit from '../models/Visit.js';

export const createVisit = async (req, res, next) => {
  try {
    const { stadium, visitDate, rating, reviewText, matchDetails, expenses } = req.body;

    if (!stadium || !visitDate || !rating) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    const images = (req.files || []).map((file) => file.path);

    const visit = await Visit.create({
      user: req.user._id,
      stadium,
      visitDate,
      rating,
      reviewText,
      images,
      matchDetails: matchDetails ? JSON.parse(matchDetails) : undefined,
      expenses: expenses ? JSON.parse(expenses) : undefined,
    });

    res.status(201).json(visit);
  } catch (error) {
    next(error);
  }
};

export const getVisitsByUser = async (req, res, next) => {
  try {
    const visits = await Visit.find({ user: req.params.userId })
      .populate('stadium', 'name imageUrl location')
      .sort({ visitDate: -1 });

    res.json(visits);
  } catch (error) {
    next(error);
  }
};

export const getVisitsByStadium = async (req, res, next) => {
  try {
    const visits = await Visit.find({ stadium: req.params.stadiumId })
      .populate('user', 'username profile.avatarUrl')
      .sort({ visitDate: -1 });

    res.json(visits);
  } catch (error) {
    next(error);
  }
};
