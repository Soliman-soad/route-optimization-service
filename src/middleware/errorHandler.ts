import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  time_limit_ms?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors -> 400
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Solver timeout -> 408
  if (err.code === 'SOLVER_TIMEOUT') {
    res.status(408).json({
      error: 'Solver timed out',
      time_limit_ms: err.time_limit_ms,
    });
    return;
  }

  // ORS unavailable -> 502
  if (
    err.message?.includes('ORS') &&
    (err.message.includes('unavailable') || err.message.includes('API'))
  ) {
    res.status(502).json({ error: 'Routing service unavailable' });
    return;
  }

  // Explicit status codes
  if (err.statusCode) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Fallback 500
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}
