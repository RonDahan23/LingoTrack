import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/** Thrown by route handlers to signal a specific HTTP status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
}

/**
 * Express identifies error middleware by arity, so `next` must stay in the
 * signature even though it is unused.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err instanceof HttpError ? err.status : 500;
  const message =
    err instanceof HttpError
      ? err.message
      : env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err instanceof Error
          ? err.message
          : String(err);

  if (status >= 500) {
    console.error('[error]', err);
  }

  res.status(status).json({ error: message });
}
