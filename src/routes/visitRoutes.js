import { Router } from 'express';
import {
  createVisit,
  getVisitsByUser,
  getVisitsByStadium,
} from '../controllers/visitController.js';
import { protect } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = Router();

router.post('/', protect, upload.array('images', 5), createVisit);
router.get('/user/:userId', getVisitsByUser);
router.get('/stadium/:stadiumId', getVisitsByStadium);

export default router;
