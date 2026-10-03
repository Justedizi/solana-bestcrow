import { Router } from 'express';
import { config } from '../../config.js';
import type { Store } from '../../db/index.js';
import { getStats } from '../../services/campaigns.js';
import {
  CAMPAIGN_ACCOUNT_SIZE,
  DONOR_LEDGER_ACCOUNT_SIZE,
  MAX_DONORS,
  PROGRAM_ID,
  instructionDiscriminators,
  toHex,
} from '../../solana/program.js';
import { bus } from '../../util/bus.js';

export function systemRouter(store: Store): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      cluster: config.cluster,
      programId: PROGRAM_ID,
      lastIndexedSlot: Number(store.getSyncState('slot') ?? 0),
      lastSignature: store.getSyncState('last_signature'),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/stats', (_req, res) => {
    res.json(getStats(store));
  });

  router.get('/program', (_req, res) => {
    res.json({
      programId: PROGRAM_ID,
      cluster: config.cluster,
      rpcUrl: config.rpcUrl,
      accounts: {
        campaign: { size: CAMPAIGN_ACCOUNT_SIZE, maxDonors: MAX_DONORS },
        donorLedger: { size: DONOR_LEDGER_ACCOUNT_SIZE },
      },
      instructions: Object.fromEntries(
        Object.entries(instructionDiscriminators).map(([name, discriminator]) => [name, toHex(discriminator)]),
      ),
    });
  });

  router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: unknown): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: 'hello', slot: Number(store.getSyncState('slot') ?? 0) });

    const onSync = (event: unknown): void => send(event);
    bus.on('sync', onSync);

    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    keepAlive.unref?.();

    req.on('close', () => {
      bus.off('sync', onSync);
      clearInterval(keepAlive);
      res.end();
    });
  });

  return router;
}
