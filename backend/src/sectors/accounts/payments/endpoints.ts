import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { wrap } from '../../../api/middleware/error.js';
import { PaymentService } from './service.js';

const createSchema = z.object({
  campaign: z.string(),
  wallet: z.string(),
  amount: z.string().max(20),
}).strict();
const confirmSchema = z.object({ signature: z.string().min(1).max(88) }).strict();

export class PaymentEndpoints {
  readonly router: Router;

  constructor(service: PaymentService, requireSession: RequestHandler) {
    this.router = Router();
    this.router.use(requireSession);
    this.router.post('/', wrap(async (req, res) => {
      res.status(201).json(await service.create(res.locals.user.id as string, createSchema.parse(req.body)));
    }));
    this.router.get('/', (req, res) => {
      res.json(service.list(res.locals.user.id as string));
    });
    this.router.get('/:id', wrap(async (req, res) => {
      res.json(service.get(res.locals.user.id as string, req.params.id!));
    }));
    this.router.post('/:id/confirm', wrap(async (req, res) => {
      res.json(await service.confirm(res.locals.user.id as string, req.params.id!, confirmSchema.parse(req.body)));
    }));
  }
}
