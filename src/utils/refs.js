import Club from '../models/Club.js';
import Stadium from '../models/Stadium.js';
import { isObjectId } from './validation.js';

// Vacío (sin club) o id de un club que existe
export const isValidClubRef = async (value) => !value || (isObjectId(value) && Boolean(await Club.exists({ _id: value })));

export const stadiumExists = async (id) => isObjectId(id) && Boolean(await Stadium.exists({ _id: id }));
