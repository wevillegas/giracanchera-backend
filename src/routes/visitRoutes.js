import { Router } from 'express';
import {
  createVisit,
  updateVisit,
  deleteVisit,
  getVisitsByUser,
  getVisitsByStadium,
} from '../controllers/visitController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { uploadVisitPhotos } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.post('/', protect, uploadVisitPhotos.array('photos', 4), createVisit);
router.put('/:id', protect, uploadVisitPhotos.array('photos', 4), updateVisit);
router.delete('/:id', protect, deleteVisit);
router.get('/user/:userId', getVisitsByUser);
router.get('/stadium/:stadiumId', getVisitsByStadium);

export default router;
