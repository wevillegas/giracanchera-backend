import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { rateLimit } from 'express-rate-limit';
import cloudinary from '../config/cloudinary.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Rechaza antes de subir a Cloudinary todo lo que no sea una imagen permitida
export const imageFilter = (req, file, cb) => {
  if (IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
  const error = Object.assign(new Error('Solo se permiten imágenes JPG, PNG o WebP'), { status: 400 });
  return cb(error);
};

// Cuida la cuota de Cloudinary: 30 subidas por hora y por IP
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Subiste muchas imágenes. Probá de nuevo más tarde.' },
});

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'giracanchera/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

const visitStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'giracanchera/visits',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

const clubLogoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'giracanchera/clubs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

// Fotos de estadio: se recortan a 16:9 al subir, así todas tienen la misma proporción
const stadiumImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'giracanchera/stadiums',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1280, height: 720, crop: 'fill', gravity: 'auto' }],
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadVisitPhotos = multer({
  storage: visitStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadClubLogo = multer({
  storage: clubLogoStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadStadiumImage = multer({
  storage: stadiumImageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
