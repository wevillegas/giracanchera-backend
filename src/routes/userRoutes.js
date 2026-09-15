import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getPublicProfile,
  toggleWantToVisit,
  addFriend,
} from '../controllers/userController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { uploadAvatar } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.get('/profile', protect, getProfile);
router.put('/profile', protect, uploadAvatar.single('avatar'), updateProfile);
router.get('/:id', getPublicProfile);
router.post('/want-to-visit/:stadiumId', protect, toggleWantToVisit);
router.post('/friends/:friendId', protect, addFriend);

export default router;
