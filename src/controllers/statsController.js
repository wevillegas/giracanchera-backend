import Visit from '../models/Visit.js';
import Stadium from '../models/Stadium.js';
import Club from '../models/Club.js';
import User from '../models/User.js';
import Report from '../models/Report.js';

const TOP_SIZE = 5;
const MIN_REVIEWS_FOR_RANKING = 3;

// La mediana no se deja arrastrar por valores extremos (el promedio sí)
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

// Estadísticas públicas de la comunidad: solo datos agregados, nada personal
export const getPublicStats = async (req, res, next) => {
  try {
    const [stadiumCount, clubCount, userCount, perStadium, expenseAvg, overall] = await Promise.all([
      Stadium.countDocuments(),
      Club.countDocuments(),
      User.countDocuments(),
      Visit.aggregate([
        { $group: { _id: '$stadium', reviews: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
      ]),
      // Gasto total por visita, solo de las visitas con gastos cargados
      Visit.aggregate([
        {
          $project: {
            total: {
              $add: [
                { $ifNull: ['$expenses.ticket', 0] },
                { $ifNull: ['$expenses.food', 0] },
                { $ifNull: ['$expenses.parking', 0] },
                { $ifNull: ['$expenses.transport', 0] },
              ],
            },
          },
        },
        { $match: { total: { $gt: 0 } } },
      ]),
      Visit.aggregate([
        { $group: { _id: null, reviews: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    const stadiumIds = perStadium.map((s) => s._id);
    const stadiums = await Stadium.find({ _id: { $in: stadiumIds } })
      .select('name location imageUrl mainClub')
      .populate('mainClub', 'name logoUrl');
    const byId = new Map(stadiums.map((s) => [String(s._id), s]));

    // Filas por estadio con su información, descartando estadios borrados
    const rows = perStadium
      .map((row) => {
        const stadium = byId.get(String(row._id));
        if (!stadium) return null;
        return {
          id: String(stadium._id),
          name: stadium.name,
          city: stadium.location?.city || '',
          province: stadium.location?.province || '',
          reviews: row.reviews,
          avgRating: Math.round(row.avgRating * 10) / 10,
          clubName: stadium.mainClub?.name || '',
          clubLogoUrl: stadium.mainClub?.logoUrl || '',
          imageUrl: stadium.imageUrl || '',
          mainClubId: stadium.mainClub?._id ? String(stadium.mainClub._id) : null,
          placeLabel: stadium.location?.province || stadium.location?.city || '',
        };
      })
      .filter(Boolean);

    const topReviewed = [...rows].sort((a, b) => b.reviews - a.reviews).slice(0, TOP_SIZE);
    const topRated = rows
      .filter((r) => r.reviews >= MIN_REVIEWS_FOR_RANKING)
      .sort((a, b) => b.avgRating - a.avgRating || b.reviews - a.reviews)
      .slice(0, TOP_SIZE);

    // Clubes: suma de reseñas de los estadios que tienen como club dueño
    const clubsMap = new Map();
    for (const r of rows) {
      if (!r.mainClubId) continue;
      const current = clubsMap.get(r.mainClubId) || { name: r.clubName, logoUrl: r.clubLogoUrl, reviews: 0, stadiums: 0 };
      current.reviews += r.reviews;
      current.stadiums += 1;
      clubsMap.set(r.mainClubId, current);
    }
    const topClubs = [...clubsMap.values()].sort((a, b) => b.reviews - a.reviews).slice(0, TOP_SIZE);

    // Por provincia (o ciudad, si no tiene provincia)
    const provinceMap = new Map();
    for (const r of rows) {
      const key = r.placeLabel || 'Sin provincia';
      const current = provinceMap.get(key) || { place: key, stadiums: 0, reviews: 0 };
      current.stadiums += 1;
      current.reviews += r.reviews;
      provinceMap.set(key, current);
    }
    const byPlace = [...provinceMap.values()].sort((a, b) => b.reviews - a.reviews);

    const totals = {
      stadiums: stadiumCount,
      clubs: clubCount,
      users: userCount,
      reviews: overall[0]?.reviews || 0,
      avgRating: overall[0] ? Math.round(overall[0].avgRating * 10) / 10 : 0,
      avgExpense: median(expenseAvg.map((e) => e.total)),
    };

    res.json({ totals, topReviewed, topRated, topClubs, byPlace });
  } catch (error) {
    next(error);
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Analíticas internas (solo admin): datos de operación y de actividad de los usuarios
export const getAdminStats = async (req, res, next) => {
  try {
    const now = Date.now();
    const since = (days) => new Date(now - days * DAY_MS);

    const [
      userTotal, adminTotal, newUsers7, newUsers30, visits30,
      reportsOpen, reportsResolved,
      stadiumTotal, stadiumNoPhoto, stadiumNoOwner, stadiumProvince,
      topReviewers, usersByWeek, visitsByDay,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ rol: { $in: ['admin', 'superadmin'] } }),
      User.countDocuments({ createdAt: { $gte: since(7) } }),
      User.countDocuments({ createdAt: { $gte: since(30) } }),
      Visit.countDocuments({ createdAt: { $gte: since(30) } }),
      Report.countDocuments({ status: 'open' }),
      Report.countDocuments({ status: 'resolved' }),
      Stadium.countDocuments(),
      Stadium.countDocuments({ $or: [{ imageUrl: '' }, { imageUrl: { $exists: false } }] }),
      Stadium.countDocuments({ mainClub: null, ownerType: { $ne: 'province' } }),
      Stadium.countDocuments({ ownerType: 'province' }),
      Visit.aggregate([
        { $group: { _id: '$user', reviews: { $sum: 1 } } },
        { $sort: { reviews: -1 } },
        { $limit: TOP_SIZE },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: since(56) } } },
        { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Visit.aggregate([
        { $match: { createdAt: { $gte: since(30) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const reviewerUsers = await User.find({ _id: { $in: topReviewers.map((r) => r._id) } }).select('username');
    const names = new Map(reviewerUsers.map((u) => [String(u._id), u.username]));

    res.json({
      users: { total: userTotal, admins: adminTotal, new7: newUsers7, new30: newUsers30 },
      visits30,
      reports: { open: reportsOpen, resolved: reportsResolved },
      stadiums: { total: stadiumTotal, noPhoto: stadiumNoPhoto, noOwner: stadiumNoOwner, province: stadiumProvince },
      topReviewers: topReviewers.map((r) => ({ username: names.get(String(r._id)) || '—', reviews: r.reviews })),
      usersByWeek: usersByWeek.map((r) => ({ label: r._id, count: r.count })),
      visitsByDay: visitsByDay.map((r) => ({ label: r._id, count: r.count })),
    });
  } catch (error) {
    next(error);
  }
};
