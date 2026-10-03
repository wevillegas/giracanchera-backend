import { Router } from 'express';
import {
  getClubs, listClubs, createClub, updateClub, deleteClub,
} from '../controllers/clubController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';
import { uploadClubLogo } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.get('/list', listClubs);
router.get('/', getClubs);
router.post('/', protect, adminOnly, uploadClubLogo.single('logo'), createClub);
router.put('/:id', protect, adminOnly, uploadClubLogo.single('logo'), updateClub);
router.delete('/:id', protect, adminOnly, deleteClub);

export default router;
