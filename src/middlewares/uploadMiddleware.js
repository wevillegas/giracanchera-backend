import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

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
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadVisitPhotos = multer({
  storage: visitStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadClubLogo = multer({
  storage: clubLogoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadStadiumImage = multer({
  storage: stadiumImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});
