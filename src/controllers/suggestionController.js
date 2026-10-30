import { isId } from '../utils/validation.js';
import { checkSuggestion, suggestionUpdate } from '../utils/suggestionFields.js';
import prisma from '../config/prisma.js';
import { stadiumExists } from '../utils/refs.js';
import { logAudit } from '../utils/audit.js';

// Usuario logueado: propone corregir un dato de un estadio
export const createSuggestion = async (req, res, next) => {
  try {
    const { field, value, note = '' } = req.body;
    const inputError = checkSuggestion({ field, value, note });
    if (inputError) return res.status(400).json({ message: inputError });
    if (!(await stadiumExists(req.params.id))) {
      return res.status(404).json({ message: 'Estadio no encontrado' });
    }

    try {
      await prisma.stadiumSuggestion.create({ data: { stadiumId: req.params.id, authorId: req.user.id, field, value, note } });
    } catch (error) {
      if (error.code === 'P2002') return res.status(400).json({ message: 'Ya enviaste una corrección de este dato y está en revisión' });
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
    const suggestions = await prisma.stadiumSuggestion.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true } },
        stadium: {
          select: {
            id: true, name: true, capacity: true, nickname: true, openedYear: true, surface: true, status: true, history: true,
            pitchLength: true, pitchWidth: true,
          },
        },
      },
    });
    res.json(suggestions.map((s) => ({
      _id: s.id,
      stadium: s.stadium && {
        _id: s.stadium.id, name: s.stadium.name, capacity: s.stadium.capacity, nickname: s.stadium.nickname,
        openedYear: s.stadium.openedYear, surface: s.stadium.surface, status: s.stadium.status, history: s.stadium.history,
        pitch: { length: s.stadium.pitchLength, width: s.stadium.pitchWidth },
      },
      author: s.author && { _id: s.author.id, username: s.author.username },
      field: s.field,
      value: s.value,
      note: s.note,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })));
  } catch (error) {
    next(error);
  }
};

// Admin: aprueba (aplica el cambio al estadio) o descarta
export const resolveSuggestion = async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'Acción inválida' });
    const suggestion = isId(req.params.id)
      ? await prisma.stadiumSuggestion.findUnique({ where: { id: req.params.id }, include: { stadium: { select: { id: true, name: true } } } })
      : null;
    if (!suggestion || suggestion.status !== 'pending') return res.status(404).json({ message: 'Sugerencia no encontrada' });

    if (action === 'approve') {
      const update = suggestionUpdate(suggestion);
      // Se revalida por si las reglas cambiaron desde que se envió
      if (update && !checkSuggestion(suggestion) && suggestion.stadium) {
        await prisma.stadium.update({ where: { id: suggestion.stadium.id }, data: update });
      }
    }
    await prisma.stadiumSuggestion.update({
      where: { id: suggestion.id },
      data: { status: action === 'approve' ? 'approved' : 'rejected' },
    });

    const name = suggestion.stadium?.name ?? 'un estadio';
    logAudit(req.user, {
      action: 'resolve', entity: 'suggestion', entityId: suggestion.id,
      summary: `${action === 'approve' ? 'Aprobó' : 'Descartó'} una corrección de ${name}`, fields: [suggestion.field],
    });
    res.json({ message: action === 'approve' ? 'Corrección aprobada' : 'Corrección descartada' });
  } catch (error) {
    next(error);
  }
};
