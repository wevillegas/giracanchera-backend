import { Router } from 'express';
import {
  getStadiums,
  createStadium,
  updateStadium,
  deleteStadium,
  getStadiumById,
} from '../controllers/stadiumController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getStadiums);
router.post('/', protect, adminOnly, createStadium);
router.put('/:id', protect, adminOnly, updateStadium);
router.delete('/:id', protect, adminOnly, deleteStadium);
router.get('/:id', getStadiumById);

export default router;
