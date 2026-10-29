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
  adminUserActivity,
  adminDeleteUser,
  deleteMe,
  getMyStats,
  changePassword,
} from '../controllers/userController.js';
import { protect, adminOnly, optionalProtect } from '../middlewares/authMiddleware.js';
import { uploadAvatar, uploadLimiter } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.get('/profile', protect, getProfile);
router.put('/profile', protect, uploadLimiter, uploadAvatar.single('avatar'), updateProfile);
router.get('/search', protect, searchUsers);
router.delete('/me', protect, deleteMe);
router.put('/me/password', protect, changePassword);
router.get('/me/stats', protect, getMyStats);
router.get('/admin/all', protect, adminOnly, getAllUsers);
router.get('/admin/:id/activity', protect, adminOnly, adminUserActivity);
router.put('/admin/:id', protect, adminOnly, adminUpdateUser);
router.delete('/admin/:id', protect, adminOnly, adminDeleteUser);
router.get('/:id', optionalProtect, getPublicProfile);
router.post('/want-to-visit/:stadiumId', protect, toggleWantToVisit);
router.post('/follow/:userId', protect, toggleFollow);

export default router;
