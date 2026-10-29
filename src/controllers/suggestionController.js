import { isObjectId } from '../utils/validation.js';
import { checkSuggestion, suggestionUpdate } from '../utils/suggestionFields.js';
import Stadium from '../models/Stadium.js';
import StadiumSuggestion from '../models/StadiumSuggestion.js';
import { logAudit } from '../utils/audit.js';

// Usuario logueado: propone corregir un dato de un estadio
export const createSuggestion = async (req, res, next) => {
  try {
    const { field, value, note = '' } = req.body;
    const inputError = checkSuggestion({ field, value, note });
    if (inputError) return res.status(400).json({ message: inputError });
    if (!isObjectId(req.params.id) || !(await Stadium.exists({ _id: req.params.id }))) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    try {
      await StadiumSuggestion.create({ stadium: req.params.id, author: req.user._id, field, value, note });
    } catch (error) {
      if (error.code === 11000) return res.status(400).json({ message: 'Ya enviaste una corrección de este dato y está en revisión' });
      throw error;
    }
    res.status(201).json({ message: 'Gracias, revisaremos tu corrección' });
  } catch (error) {
    next(error);
  }
};

// Admin: sugerencias pendientes, con el valor actual del estadio para comparar
export const getSuggestions = async (req, res, next) => {
  try {
    const suggestions = await StadiumSuggestion.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('author', 'username')
      .populate('stadium', 'name capacity nickname openedYear surface status history pitch');
    res.json(suggestions);
  } catch (error) {
    next(error);
  }
};

// Admin: aprueba (aplica el cambio al estadio) o descarta
export const resolveSuggestion = async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'Acción inválida' });
    const suggestion = await StadiumSuggestion.findById(req.params.id).populate('stadium', 'name');
    if (!suggestion || suggestion.status !== 'pending') return res.status(404).json({ message: 'Sugerencia no encontrada' });

    if (action === 'approve') {
      const update = suggestionUpdate(suggestion);
      // Se revalida por si las reglas cambiaron desde que se envió
      if (update && !checkSuggestion(suggestion) && suggestion.stadium) {
        await Stadium.updateOne({ _id: suggestion.stadium._id }, { $set: update });
      }
    }
    suggestion.status = action === 'approve' ? 'approved' : 'rejected';
    await suggestion.save();

    const name = suggestion.stadium?.name ?? 'un estadio';
    logAudit(req.user, {
      action: 'resolve', entity: 'suggestion', entityId: suggestion._id,
      summary: `${action === 'approve' ? 'Aprobó' : 'Descartó'} una corrección de ${name}`, fields: [suggestion.field],
    });
    res.json({ message: action === 'approve' ? 'Corrección aprobada' : 'Corrección descartada' });
  } catch (error) {
    next(error);
  }
};
