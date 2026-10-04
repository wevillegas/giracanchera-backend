import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getPublicProfile,
  toggleWantToVisit,
  toggleFollow,
  searchUsers,
  getAllUsers,
  adminUpdateUser,
  adminDeleteUser,
  deleteMe,
} from '../controllers/userController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';
import { uploadAvatar } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.get('/profile', protect, getProfile);
router.put('/profile', protect, uploadAvatar.single('avatar'), updateProfile);
router.get('/search', protect, searchUsers);
router.delete('/me', protect, deleteMe);
router.get('/admin/all', protect, adminOnly, getAllUsers);
router.put('/admin/:id', protect, adminOnly, adminUpdateUser);
router.delete('/admin/:id', protect, adminOnly, adminDeleteUser);
router.get('/:id', getPublicProfile);
router.post('/want-to-visit/:stadiumId', protect, toggleWantToVisit);
router.post('/follow/:userId', protect, toggleFollow);

export default router;
