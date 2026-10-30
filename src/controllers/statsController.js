import prisma from '../config/prisma.js';
import { byText } from '../db/serialize.js';

// Las reseñas ocultas por moderación no entran en ninguna cuenta
const VISIBLE = { hidden: false };

const TOP_SIZE = 5;
const RANKING_SIZE = 30; // tope de filas de cada ranking público; el front las muestra de a pocas, con paginación
const MIN_REVIEWS_FOR_RANKING = 3;

// La mediana no se deja arrastrar por valores extremos (el promedio sí)
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

// Redondeo a 1 decimal "a la par" (8,25 → 8,2; 8,35 → 8,4), el mismo que usaba Mongo en las analíticas
function roundHalfEven(value) {
  const scaled = value * 10;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const rounded = Math.abs(diff - 0.5) < 1e-9 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(scaled);
  return rounded / 10;
}

// Estadísticas públicas de la comunidad: solo datos agregados, nada personal
export const getPublicStats = async (req, res, next) => {
  try {
    const [stadiumCount, clubCount, userCount, perStadium, expenseTotals, overall] = await Promise.all([
      prisma.stadium.count(),
      prisma.club.count(),
      prisma.user.count(),
      prisma.visit.groupBy({ by: ['stadiumId'], where: VISIBLE, _count: { _all: true }, _avg: { rating: true } }),
      // Gasto total por visita, solo de las visitas con gastos cargados
      prisma.$queryRaw`
        SELECT (expense_ticket + expense_food + expense_parking + expense_transport)::float AS total
        FROM visits
        WHERE hidden = false AND (expense_ticket + expense_food + expense_parking + expense_transport) > 0`,
      prisma.visit.aggregate({ where: VISIBLE, _count: { _all: true }, _avg: { rating: true } }),
    ]);

    const stadiums = await prisma.stadium.findMany({
      where: { id: { in: perStadium.map((s) => s.stadiumId) } },
      select: {
        id: true, name: true, city: true, province: true, imageUrl: true, mainClubId: true,
        mainClub: { select: { name: true, logoUrl: true } },
      },
    });
    const byId = new Map(stadiums.map((s) => [s.id, s]));

    // Filas por estadio con su información
    const rows = perStadium
      .map((row) => {
        const stadium = byId.get(row.stadiumId);
        if (!stadium) return null;
        return {
          id: stadium.id,
          name: stadium.name,
          city: stadium.city || '',
          province: stadium.province || '',
          reviews: row._count._all,
          avgRating: Math.round(row._avg.rating * 10) / 10,
          clubName: stadium.mainClub?.name || '',
          clubLogoUrl: stadium.mainClub?.logoUrl || '',
          imageUrl: stadium.imageUrl || '',
          mainClubId: stadium.mainClubId,
          placeLabel: stadium.province || stadium.city || '',
        };
      })
      .filter(Boolean);

    const topReviewed = [...rows].sort((a, b) => b.reviews - a.reviews).slice(0, RANKING_SIZE);
    const topRated = rows
      .filter((r) => r.reviews >= MIN_REVIEWS_FOR_RANKING)
      .sort((a, b) => b.avgRating - a.avgRating || b.reviews - a.reviews)
      .slice(0, RANKING_SIZE);

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

    // Hinchas por club: todos los clubes cargados (también los que no tienen ninguno), de más a menos
    // El club no guarda país: se toma del país de su estadio (si tiene varios, el primero)
    const [allClubs, clubStadiums, fansPerClub] = await Promise.all([
      prisma.club.findMany({ select: { id: true, name: true, logoUrl: true }, orderBy: { createdAt: 'asc' } }),
      prisma.stadium.findMany({ where: { mainClubId: { not: null } }, select: { mainClubId: true, country: true }, orderBy: { seq: 'asc' } }),
      prisma.user.groupBy({ by: ['clubHinchaId'], where: { clubHinchaId: { not: null } }, _count: { _all: true } }),
    ]);
    const fansById = new Map(fansPerClub.map((row) => [row.clubHinchaId, row._count._all]));
    const countryById = new Map();
    for (const s of clubStadiums) {
      if (!countryById.has(s.mainClubId) && s.country) countryById.set(s.mainClubId, s.country);
    }
    const clubFans = allClubs
      .map((club) => ({ id: club.id, name: club.name, logoUrl: club.logoUrl || '', country: countryById.get(club.id) || '', fans: fansById.get(club.id) || 0 }))
      .sort((a, b) => b.fans - a.fans || a.name.localeCompare(b.name, 'es'));

    const totals = {
      stadiums: stadiumCount,
      clubs: clubCount,
      users: userCount,
      reviews: overall._count._all,
      avgRating: overall._count._all ? Math.round(overall._avg.rating * 10) / 10 : 0,
      avgExpense: median(expenseTotals.map((e) => e.total)),
    };

    res.json({ totals, topReviewed, topRated, byPlace, clubFans });
  } catch (error) {
    next(error);
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Cantidades por día ('YYYY-MM-DD') o por semana ISO ('YYYY-Www'), en hora UTC como lo calculaba Mongo
const perDay = (since, until = new Date()) => prisma.$queryRaw`
  SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS label, COUNT(*)::int AS count
  FROM visits
  WHERE hidden = false AND created_at >= ${since} AND created_at < ${until}
  GROUP BY label ORDER BY label`;

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
      prisma.user.count(),
      prisma.user.count({ where: { rol: { in: ['admin', 'superadmin'] } } }),
      prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
      prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
      prisma.visit.count({ where: { createdAt: { gte: since(30) }, ...VISIBLE } }),
      prisma.report.count({ where: { status: 'open' } }),
      prisma.report.count({ where: { status: 'resolved' } }),
      prisma.stadium.count(),
      prisma.stadium.count({ where: { imageUrl: '' } }),
      prisma.stadium.count({ where: { mainClubId: null, ownerType: { not: 'province' } } }),
      prisma.stadium.count({ where: { ownerType: 'province' } }),
      prisma.visit.groupBy({ by: ['userId'], where: VISIBLE, _count: { _all: true }, orderBy: { _count: { userId: 'desc' } }, take: TOP_SIZE }),
      prisma.$queryRaw`
        SELECT to_char(created_at AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS label, COUNT(*)::int AS count
        FROM users WHERE created_at >= ${since(56)}
        GROUP BY label ORDER BY label`,
      perDay(since(30), new Date(now + DAY_MS)),
    ]);

    const reviewerUsers = await prisma.user.findMany({ where: { id: { in: topReviewers.map((r) => r.userId) } }, select: { id: true, username: true } });
    const names = new Map(reviewerUsers.map((u) => [u.id, u.username]));

    // Período elegible (7, 30 o 90 días) comparado con el período anterior de igual duración
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const between = (from, to) => ({ createdAt: { gte: since(from), lt: since(to) } });
    const [periodVisits, prevVisits, periodUsers, prevUsers, periodByDay, topStadiumsAgg, reviewed, allStadiums] = await Promise.all([
      prisma.visit.count({ where: { ...between(days, 0), ...VISIBLE } }),
      prisma.visit.count({ where: { ...between(days * 2, days), ...VISIBLE } }),
      prisma.user.count({ where: between(days, 0) }),
      prisma.user.count({ where: between(days * 2, days) }),
      perDay(since(days), since(0)),
      prisma.$queryRaw`
        SELECT s.name, COUNT(*)::int AS reviews, AVG(v.rating)::float AS avg, c.logo_url AS "logoUrl"
        FROM visits v
        JOIN stadiums s ON s.id = v.stadium_id
        LEFT JOIN clubs c ON c.id = s.main_club_id
        WHERE v.hidden = false AND v.created_at >= ${since(days)} AND v.created_at < ${since(0)}
        GROUP BY s.id, s.name, c.logo_url
        ORDER BY reviews DESC, s.name
        LIMIT 8`,
      prisma.visit.findMany({ where: VISIBLE, distinct: ['stadiumId'], select: { stadiumId: true } }),
      prisma.stadium.findMany({ select: { id: true, name: true } }),
    ]);
    const reviewedIds = new Set(reviewed.map((r) => r.stadiumId));
    const unreviewed = allStadiums.filter((s) => !reviewedIds.has(s.id)).sort(byText('name'));

    res.json({
      period: {
        days,
        visits: periodVisits, visitsPrev: prevVisits,
        newUsers: periodUsers, newUsersPrev: prevUsers,
        byDay: periodByDay.map((r) => ({ label: r.label, count: r.count })),
      },
      topStadiums: topStadiumsAgg.map((s) => ({ name: s.name, reviews: s.reviews, avg: roundHalfEven(s.avg), logoUrl: s.logoUrl || '' })),
      unreviewed: { total: allStadiums.length - reviewedIds.size, sample: unreviewed.slice(0, 15).map((s) => s.name) },
      users: { total: userTotal, admins: adminTotal, new7: newUsers7, new30: newUsers30 },
      visits30,
      reports: { open: reportsOpen, resolved: reportsResolved },
      stadiums: { total: stadiumTotal, noPhoto: stadiumNoPhoto, noOwner: stadiumNoOwner, province: stadiumProvince },
      topReviewers: topReviewers.map((r) => ({ username: names.get(r.userId) || '—', reviews: r._count._all })),
      usersByWeek: usersByWeek.map((r) => ({ label: r.label, count: r.count })),
      visitsByDay: visitsByDay.map((r) => ({ label: r.label, count: r.count })),
    });
  } catch (error) {
    next(error);
  }
};
