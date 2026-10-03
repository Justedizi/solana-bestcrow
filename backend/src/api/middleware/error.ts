import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (message = 'Not found'): ApiError => new ApiError(404, message);
export const badRequest = (message: string, details?: unknown): ApiError => new ApiError(400, message, details);

/** Wrap an async handler so rejected promises reach the Express error middleware. */
export const wrap =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message, details: error.details ?? undefined });
    return;
  }
  if (error instanceof ZodError) {
    res.status(422).json({ error: 'Validation failed', details: error.issues });
    return;
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ error: 'JSON body exceeds the 256kb limit' });
    return;
  }
  console.error('[api] unhandled error:', error instanceof Error ? error.name : 'Unknown error');
  res.status(500).json({ error: 'Internal server error' });
}
