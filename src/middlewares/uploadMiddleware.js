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

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadVisitPhotos = multer({
  storage: visitStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});
