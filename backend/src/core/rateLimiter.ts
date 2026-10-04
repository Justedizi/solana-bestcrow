import type { RequestHandler } from 'express';
import { ApiError } from '../api/middleware/error.js';

export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; expiresAt: number }>();

  public constructor(
    private readonly limit = 20,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  public readonly middleware: RequestHandler = (req, res, next) => {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const bucket = this.buckets.get(key) ?? { count: 0, expiresAt: now + this.windowMs };
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (bucket.count > this.limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.expiresAt - now) / 1000));
      next(new ApiError(429, 'Too many attempts. Try again later.'));
      return;
    }
    next();
  };
}
