import { Router } from 'express';
import { getClubs, listClubs, createClub } from '../controllers/clubController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/list', listClubs);
router.get('/', getClubs);
router.post('/', protect, createClub);

export default router;
