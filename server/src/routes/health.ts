import { Router } from 'express';
import type { HealthResponse } from '@getit/shared';
import { isDbHealthy } from '../db';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const db = await isDbHealthy();
  const body: HealthResponse = { ok: db, db };
  res.status(db ? 200 : 503).json(body);
});
