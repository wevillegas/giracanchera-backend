import { Router } from 'express';
import {
  getStadiums,
  createStadium,
  getStadiumById,
} from '../controllers/stadiumController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getStadiums);
router.post('/', protect, createStadium);
router.get('/:id', getStadiumById);

export default router;
