import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifySessionToken } from '../services/sessionService.js';
import { HttpError } from './errorHandler.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Populates `req.userId` from the `Authorization: Bearer <session>` header. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing bearer token');
  }

  const userId = verifySessionToken(header.slice('Bearer '.length).trim());
  if (!userId) {
    throw new HttpError(401, 'Invalid or expired session token');
  }

  req.userId = userId;
  next();
}

/**
 * Express 4 does not forward rejected promises to the error handler, so every
 * async route body must be wrapped.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
