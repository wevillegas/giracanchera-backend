// Arma las respuestas de la API con la misma forma que tenían con MongoDB (el frontend no cambia):
// el id va en `_id`, la ubicación y el partido anidados, las relaciones "pobladas" como objetos y las listas de ids
// como arreglos. Cada `*Select` es lo que hay que pedirle a Prisma para poder armar esa forma.

// Orden por texto igual al de Mongo (por código de carácter, no por idioma): así el orden no depende de la base
export const byText = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

// ---------- clubes ----------
export const clubBadgeSelect = { id: true, name: true, logoUrl: true };
export const clubBadge = (c) => (c ? { _id: c.id, name: c.name, logoUrl: c.logoUrl } : null);

export const clubSummarySelect = { id: true, name: true, logoUrl: true, location: true };
export const clubSummary = (c) => (c ? { _id: c.id, name: c.name, logoUrl: c.logoUrl, location: c.location } : null);

export const clubJson = (c) => (c ? {
  _id: c.id, name: c.name, logoUrl: c.logoUrl, location: c.location, createdAt: c.createdAt, updatedAt: c.updatedAt,
} : null);

// ---------- estadios ----------
export const locationOf = (s) => ({ city: s.city, province: s.province, country: s.country, coordinates: { lat: s.lat, lng: s.lng } });
const locationSelect = { city: true, province: true, country: true, lat: true, lng: true };

export const stadiumInclude = {
  mainClub: { select: clubSummarySelect },
  photos: { orderBy: { position: 'asc' }, select: { url: true, credit: true } },
};

// Ficha completa. mainClub va poblado si se pidió con stadiumInclude; si no, como id
export const stadiumJson = (s) => ({
  _id: s.id,
  name: s.name,
  capacity: s.capacity,
  location: locationOf(s),
  ownerType: s.ownerType,
  mainClub: s.mainClub !== undefined ? clubSummary(s.mainClub) : s.mainClubId,
  imageUrl: s.imageUrl,
  nickname: s.nickname,
  openedYear: s.openedYear,
  surface: s.surface,
  pitch: { length: s.pitchLength, width: s.pitchWidth },
  status: s.status,
  history: s.history,
  funFacts: s.funFacts,
  otherUses: s.otherUses,
  photos: (s.photos || []).map((p) => ({ url: p.url, credit: p.credit })),
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

// Estadio resumido dentro de una reseña: nombre, portada, ubicación y club
export const stadiumCardSelect = { id: true, name: true, imageUrl: true, ...locationSelect, mainClub: { select: clubSummarySelect } };
export const stadiumCard = (s) => (s ? { _id: s.id, name: s.name, imageUrl: s.imageUrl, location: locationOf(s), mainClub: clubSummary(s.mainClub) } : null);

// ---------- usuarios ----------
export const userCardSelect = { id: true, username: true, avatarUrl: true };
export const userCard = (u) => (u ? { _id: u.id, username: u.username, avatarUrl: u.avatarUrl } : null);

// Usuario en listas de seguidores/seguidos: foto, bio y escudo de su club
export const userListSelect = { id: true, username: true, avatarUrl: true, bio: true, clubHincha: { select: clubBadgeSelect } };
export const userListItem = (u) => ({ _id: u.id, username: u.username, avatarUrl: u.avatarUrl, bio: u.bio, clubHincha: clubBadge(u.clubHincha) });

// Datos propios de la cuenta (sin la contraseña). Las relaciones se pasan ya armadas.
export const accountJson = (u, { clubHincha, following, wantToVisit, savedVisits, withSession = true }) => ({
  _id: u.id,
  nombre: u.nombre,
  username: u.username,
  email: u.email,
  fechaNacimiento: u.fechaNacimiento,
  clubHincha,
  rol: u.rol,
  avatarUrl: u.avatarUrl,
  bio: u.bio,
  following,
  wantToVisit,
  ...(savedVisits !== undefined && { savedVisits }),
  mutedUntil: u.mutedUntil,
  ...(withSession && { tokenVersion: u.tokenVersion }),
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

// Ids de las listas del usuario, en el orden en que se agregaron (como los arreglos de Mongo)
export const followingIdsSelect = { following: { orderBy: { createdAt: 'asc' }, select: { followedId: true } } };
export const wishlistIdsSelect = { wishlist: { orderBy: { createdAt: 'asc' }, select: { stadiumId: true } } };
export const savedIdsSelect = { saved: { orderBy: { createdAt: 'asc' }, select: { visitId: true } } };
export const followingIds = (u) => u.following.map((f) => f.followedId);
export const wishlistIds = (u) => u.wishlist.map((w) => w.stadiumId);
export const savedIds = (u) => u.saved.map((s) => s.visitId);

// ---------- reseñas ----------
export const visitBaseInclude = {
  images: { orderBy: { position: 'asc' }, select: { url: true } },
  likes: { orderBy: { createdAt: 'asc' }, select: { userId: true } },
};

// user y stadium se pasan ya armados (poblados) si corresponde; si no, quedan como id
export const visitJson = (v, { user, stadium } = {}) => ({
  _id: v.id,
  user: user !== undefined ? user : v.userId,
  stadium: stadium !== undefined ? stadium : v.stadiumId,
  visitDate: v.visitDate,
  rating: v.rating,
  reviewText: v.reviewText,
  images: v.images.map((i) => i.url),
  likes: v.likes.map((l) => l.userId),
  hidden: v.hidden,
  hiddenReason: v.hiddenReason,
  matchDetails: { homeTeam: v.homeTeam, awayTeam: v.awayTeam, score: v.score },
  expenses: {
    ticket: v.expenseTicket, transport: v.expenseTransport, food: v.expenseFood, parking: v.expenseParking, currency: v.currency,
  },
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});

// Campos de la reseña que llegan del formulario, en columnas
export const visitColumnsFrom = ({ matchDetails, expenses }) => ({
  ...(matchDetails !== undefined && {
    homeTeam: matchDetails?.homeTeam ?? '', awayTeam: matchDetails?.awayTeam ?? '', score: matchDetails?.score ?? '',
  }),
  ...(expenses !== undefined && {
    expenseTicket: Number(expenses?.ticket ?? 0),
    expenseTransport: Number(expenses?.transport ?? 0),
    expenseFood: Number(expenses?.food ?? 0),
    expenseParking: Number(expenses?.parking ?? 0),
    currency: expenses?.currency || 'ARS',
  }),
});

// ---------- auditoría ----------
export const auditJson = (a) => ({
  _id: a.id,
  actor: a.actorId,
  actorUsername: a.actorUsername,
  action: a.action,
  entity: a.entity,
  entityId: a.entityId,
  summary: a.summary,
  fields: a.fields,
  changes: a.changes,
  createdAt: a.createdAt,
});
