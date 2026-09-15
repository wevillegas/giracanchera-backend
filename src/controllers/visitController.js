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

export const updateVisit = async (req, res, next) => {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ message: 'Visita no encontrada' });
    }
    if (visit.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'No podés editar esta visita' });
    }

    const { rating, reviewText, visitDate, matchDetails, expenses } = req.body;
    if (rating !== undefined) visit.rating = rating;
    if (reviewText !== undefined) visit.reviewText = reviewText;
    if (visitDate !== undefined) visit.visitDate = visitDate;
    if (matchDetails) visit.matchDetails = JSON.parse(matchDetails);
    if (expenses) visit.expenses = JSON.parse(expenses);

    if (req.files?.length) {
      visit.images = [...visit.images, ...req.files.map((f) => f.path)];
    }

    await visit.save();
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
    res.json({ message: 'Visita eliminada' });
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
      .populate('user', 'username avatarUrl')
      .sort({ visitDate: -1 });

    res.json(visits);
  } catch (error) {
    next(error);
  }
};
