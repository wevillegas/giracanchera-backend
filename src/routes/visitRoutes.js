import { Router } from 'express';
import {
  createVisit,
  updateVisit,
  deleteVisit,
  getVisitsByUser,
  getVisitsByStadium,
  toggleLike,
  toggleSave,
  getSavedVisits,
  getLikedVisits,
  reportVisit,
  getReports,
  resolveReport,
  adminDeleteVisit,
} from '../controllers/visitController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';
import { uploadVisitPhotos } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.post('/', protect, uploadVisitPhotos.array('photos', 4), createVisit);
router.put('/:id', protect, uploadVisitPhotos.array('photos', 4), updateVisit);
router.delete('/:id', protect, deleteVisit);
router.get('/saved', protect, getSavedVisits);
router.get('/liked', protect, getLikedVisits);
router.post('/:id/like', protect, toggleLike);
router.post('/:id/save', protect, toggleSave);
router.post('/:id/report', protect, reportVisit);
router.get('/reports', protect, adminOnly, getReports);
router.patch('/reports/:id', protect, adminOnly, resolveReport);
router.delete('/admin/:id', protect, adminOnly, adminDeleteVisit);
router.get('/user/:userId', getVisitsByUser);
router.get('/stadium/:stadiumId', getVisitsByStadium);

export default router;
