import { Router } from 'express';
import {
  getPublicProfile,
  toggleWantToVisit,
  addFriend,
} from '../controllers/userController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/:id', getPublicProfile);
router.post('/want-to-visit/:stadiumId', protect, toggleWantToVisit);
router.post('/friends/:friendId', protect, addFriend);

export default router;
