import { Router } from 'express';
import { getClubs, createClub } from '../controllers/clubController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getClubs);
router.post('/', protect, createClub);

export default router;
