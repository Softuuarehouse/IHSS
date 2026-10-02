import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { MODULES, ACTIONS, PRESETS } from '../lib/permissions.js';
import { DOCUMENTS, STAGES } from '../lib/documents.js';
import { TEMPLATES } from '../lib/grades.js';
import { REVENUE_CATEGORIES, EXPENSE_CATEGORIES } from '../models/Transaction.js';

const r = express.Router();
r.get('/', authenticate, (_req, res) => res.json({ modules: MODULES, actions: ACTIONS, presets: PRESETS, documents: DOCUMENTS, stages: STAGES, templates: TEMPLATES, categories: { revenue: REVENUE_CATEGORIES, expense: EXPENSE_CATEGORIES } }));
export default r;
