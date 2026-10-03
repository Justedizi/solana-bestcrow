import cors from 'cors';
import express, { type Express } from 'express';
import { config } from '../config.js';
import type { Store } from '../db/index.js';
import { errorHandler } from './middleware/error.js';
import { campaignsRouter } from './routes/campaigns.js';
import { instructionsRouter } from './routes/instructions.js';
import { systemRouter } from './routes/system.js';

export function createServer(store: Store): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/', (_req, res) => {
    res.json({
      name: 'bestcrow-backend',
      description: 'Indexer and REST API for the Bestcrow / Charity Vault Solana program',
      docs: '/api/program',
      health: '/api/health',
    });
  });

  app.use('/api', systemRouter(store));
  app.use('/api/campaigns', campaignsRouter(store));
  app.use('/api/instructions', instructionsRouter(store));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}
