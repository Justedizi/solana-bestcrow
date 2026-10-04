import cors from 'cors';
import express, { type Express } from 'express';
import { config } from '../config.js';
import type { Store } from '../db/index.js';
import { ApiError, errorHandler } from './middleware/error.js';
import { ChainSector, type ChainSectorOptions } from '../sectors/chain/index.js';
import { AccountsSector, type AccountSectorOptions } from '../sectors/accounts/index.js';

export interface ServerOptions {
  chain?: ChainSectorOptions;
  accounts?: AccountSectorOptions;
}

export class BackendServer {
  public readonly app: Express;
  public readonly chain: ChainSector;
  public readonly accounts: AccountsSector;

  public constructor(store: Store, options: ServerOptions = {}) {
    const app = this.app = express();
    app.disable('x-powered-by');
    app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
    app.use(express.json({ limit: '256kb' }));

    app.get('/', (_req, res) => {
      res.json({ name: 'bestcrow-backend', sectors: ['chain', 'accounts'], config: '/api/chain/config', health: '/api/health' });
    });
    this.chain = new ChainSector(store, {
      ...options.chain,
      authorizeMetadata: (req, res, next) => {
        this.accounts.requireSession(req, res, (error?: unknown) => {
          if (error) { next(error); return; }
          try {
            const campaign = this.chain.campaigns.require(req.params.address!);
            const wallets = this.accounts.wallets.list(res.locals.user.id as string);
            if (!wallets.some(wallet => wallet.address === campaign.creator)) {
              throw new ApiError(403, 'Only the campaign creator can update metadata');
            }
            next();
          } catch (failure) { next(failure); }
        });
      },
    });
    this.accounts = new AccountsSector(store, this.chain, options.accounts);
    app.use('/api/accounts', this.accounts.router);
    app.use('/api', this.chain.router);
    app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
    app.use(errorHandler);
  }
}

export function createServer(store: Store, options: ServerOptions = {}): Express {
  return new BackendServer(store, options).app;
}
