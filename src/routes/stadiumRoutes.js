import { Router } from 'express';
import {
  getStadiums,
  createStadium,
  updateStadium,
  deleteStadium,
  getStadiumById,
  getDrafts,
  startWikidataImport,
  getWikidataImport,
} from '../controllers/stadiumController.js';
import { createSuggestion, getSuggestions, resolveSuggestion } from '../controllers/suggestionController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';
import { uploadStadiumImage, uploadLimiter } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.get('/', getStadiums);
router.post('/image', protect, adminOnly, uploadLimiter, uploadStadiumImage.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Falta la imagen' });
  }
  res.status(201).json({ url: req.file.path });
});
router.post('/', protect, adminOnly, createStadium);
router.put('/:id', protect, adminOnly, updateStadium);
router.delete('/:id', protect, adminOnly, deleteStadium);
router.get('/drafts', protect, adminOnly, getDrafts);
router.post('/import-wikidata', protect, adminOnly, startWikidataImport);
router.get('/import-wikidata', protect, adminOnly, getWikidataImport);
router.get('/suggestions', protect, adminOnly, getSuggestions);
router.patch('/suggestions/:id', protect, adminOnly, resolveSuggestion);
router.post('/:id/suggestions', protect, createSuggestion);
router.get('/:id', getStadiumById);

export default router;
