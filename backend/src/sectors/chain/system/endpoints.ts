import { Router } from 'express';
import type { SystemService } from './service.js';

export const systemEndpoints = {
  health: { method: 'GET', path: '/health', auth: false },
  stats: { method: 'GET', path: '/stats', auth: false },
  program: { method: 'GET', path: '/program', auth: false },
  config: { method: 'GET', path: '/chain/config', auth: false },
  stream: { method: 'GET', path: '/stream', auth: false },
} as const;

export class SystemEndpoints {
  public readonly router = Router();

  public constructor(service: SystemService) {
    const router = this.router;
    router.get('/health', (_req, res) => res.json(service.health()));
    router.get('/stats', (_req, res) => res.json(service.stats()));
    router.get('/program', (_req, res) => res.json(service.program()));
    router.get('/chain/config', (_req, res) => res.json(service.config()));
    router.get('/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      const send = (event: unknown): void => { res.write(`data: ${JSON.stringify(event)}\n\n`); };
      send({ type: 'hello', slot: service.health().lastIndexedSlot });
      const unsubscribe = service.subscribe(send);
      const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
      keepAlive.unref?.();
      req.on('close', () => {
        unsubscribe();
        clearInterval(keepAlive);
        res.end();
      });
    });
  }
}
