import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { optimizeRequestSchema } from '../middleware/validation';
import {
  optimizeRoute,
  getOptimizationById,
  listOptimizations,
} from '../services/optimize.service';
import { renderMapPage } from '../views/mapPage';
import prisma from '../db/prisma';
import logger from '../utils/logger';

export async function handleOptimize(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Validate request body
    const parsed = optimizeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const zodErr = new ZodError(parsed.error.errors);
      res.status(400).json({
        error: 'Validation failed',
        details: zodErr.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    const { driver, stops, time_limit_ms } = parsed.data;

    // Check for duplicate stop IDs
    const ids = stops.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      res.status(422).json({ error: 'stops array contains duplicate IDs' });
      return;
    }

    if (stops.length === 0) {
      res.status(422).json({ error: 'stops array is empty' });
      return;
    }

    logger.info('POST /api/v1/optimize', {
      driver_id: driver.id,
      stop_count: stops.length,
    });

    const result = await optimizeRoute({ driver, stops, time_limit_ms });
    res.status(200).json(result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function handleGetOptimization(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { request_id } = req.params;
    const result = await getOptimizationById(request_id);
    if (!result) {
      res.status(404).json({ error: 'Optimization request not found' });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetMap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { request_id } = req.params;
    const record = await prisma.optimizationRequest.findUnique({
      where: { id: request_id },
    });
    if (!record) {
      res.status(404).json({ error: 'Optimization request not found' });
      return;
    }
    const html = renderMapPage(record);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    next(err);
  }
}

export async function handleListOptimizations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));
    const result = await listOptimizations(page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
