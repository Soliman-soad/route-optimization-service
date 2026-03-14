import { Router } from 'express';
import {
  handleOptimize,
  handleGetOptimization,
  handleGetMap,
  handleListOptimizations,
} from '../controllers/optimize.controller';

const router = Router();

/**
 * @swagger
 * /api/v1/optimize:
 *   post:
 *     summary: Run VRP optimization and get road-level route
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OptimizeRequest'
 *     responses:
 *       200:
 *         description: Optimization result with route and map URL
 *       400:
 *         description: Validation error
 *       408:
 *         description: Solver timeout
 *       502:
 *         description: Routing service unavailable
 */
router.post('/optimize', handleOptimize);

/**
 * @swagger
 * /api/v1/optimize:
 *   get:
 *     summary: List all past optimization requests (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of optimization requests
 */
router.get('/optimize', handleListOptimizations);

/**
 * @swagger
 * /api/v1/optimize/{request_id}:
 *   get:
 *     summary: Retrieve a past optimization result by ID
 *     parameters:
 *       - in: path
 *         name: request_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Optimization result
 *       404:
 *         description: Not found
 */
router.get('/optimize/:request_id', handleGetOptimization);

/**
 * @swagger
 * /api/v1/optimize/{request_id}/map:
 *   get:
 *     summary: View the Leaflet map for a route
 *     parameters:
 *       - in: path
 *         name: request_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Self-contained HTML page with Leaflet map
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       404:
 *         description: Not found
 */
router.get('/optimize/:request_id/map', handleGetMap);

export default router;
