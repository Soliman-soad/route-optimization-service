import prisma from '../db/prisma';
import { solveVRP, StopInput } from '../solver/vrp.solver';
import { getMatrix, getDirections, CoordPoint } from './routing.service';
import logger from '../utils/logger';

export interface DriverInput {
  id: string;
  name: string;
  start_lat: number;
  start_lng: number;
}

export interface OptimizeRequest {
  driver: DriverInput;
  stops: StopInput[];
  time_limit_ms?: number;
}

export interface OptimizedStop {
  position: number;
  stop_id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface OptimizeResponse {
  request_id: string;
  driver_id: string;
  optimized_sequence: OptimizedStop[];
  legs: Array<{
    from: string;
    to: string;
    distance_m: number;
    duration_s: number;
  }>;
  total_distance_m: number;
  total_duration_s: number;
  route_geometry: object;
  solver_time_ms: number;
  map_url: string;
  created_at: string;
}

const DEFAULT_TIME_LIMIT_MS = parseInt(
  process.env.OR_TOOLS_TIME_LIMIT_MS ?? '5000',
  10
);

export async function optimizeRoute(req: OptimizeRequest): Promise<OptimizeResponse> {
  const { driver, stops } = req;
  const timeLimitMs = req.time_limit_ms ?? DEFAULT_TIME_LIMIT_MS;

  // --- Build matrix points: depot (driver start) + all stops ---
  const matrixPoints: CoordPoint[] = [
    { id: 'start', lat: driver.start_lat, lng: driver.start_lng },
    ...stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })),
  ];

  logger.info('Building ORS duration matrix', {
    driver_id: driver.id,
    stop_count: stops.length,
  });

  // Step 1: Get duration matrix from ORS
  const matrixResult = await getMatrix(matrixPoints);
  const durationMatrix = matrixResult.durations;

  logger.info('Running OR-Tools VRP solver', {
    driver_id: driver.id,
    time_limit_ms: timeLimitMs,
  });

  // Step 2: Run OR-Tools VRP solver
  const solverResult = await solveVRP(stops, durationMatrix, timeLimitMs);

  if (!solverResult.success) {
    if (solverResult.error?.includes('timed out') || solverResult.solver_time_ms >= timeLimitMs) {
      const err = new Error('Solver timed out') as Error & { code: string; time_limit_ms: number };
      err.code = 'SOLVER_TIMEOUT';
      err.time_limit_ms = timeLimitMs;
      throw err;
    }
    throw new Error(`Solver failed: ${solverResult.error}`);
  }

  // Step 3: Map solver sequence back to stops
  const optimizedStops: OptimizedStop[] = solverResult.sequence.map((item, i) => {
    const stop = stops.find((s) => s.id === item.stop_id);
    if (!stop) throw new Error(`Stop not found for id: ${item.stop_id}`);
    return {
      position: i + 1,
      stop_id: stop.id,
      label: stop.label,
      lat: stop.lat,
      lng: stop.lng,
    };
  });

  // If solver didn't cover all stops (shouldn't happen), fallback to original order
  if (optimizedStops.length !== stops.length) {
    logger.warn('Solver returned fewer stops than input — using original order', {
      input: stops.length,
      solver: optimizedStops.length,
    });
    // Fill missing stops at end
    const coveredIds = new Set(optimizedStops.map((s) => s.stop_id));
    const missing = stops.filter((s) => !coveredIds.has(s.id));
    missing.forEach((s, i) => {
      optimizedStops.push({
        position: optimizedStops.length + i + 1,
        stop_id: s.id,
        label: s.label,
        lat: s.lat,
        lng: s.lng,
      });
    });
  }

  logger.info('Fetching road-level routing from ORS', {
    driver_id: driver.id,
  });

  // Step 4: Build ordered points for ORS directions (driver start + optimized stops)
  const orderedPoints: CoordPoint[] = [
    { id: 'start', lat: driver.start_lat, lng: driver.start_lng },
    ...optimizedStops.map((s) => ({ id: s.stop_id, lat: s.lat, lng: s.lng })),
  ];
  const stopIds = orderedPoints.map((p) => p.id);

  // Step 5: Get road-level route from ORS
  const routeResult = await getDirections(orderedPoints, stopIds);

  // Step 6: Persist to database
  const record = await prisma.optimizationRequest.create({
    data: {
      driver_id: driver.id,
      driver_name: driver.name,
      stops_input: stops as unknown as object,
      optimized_sequence: optimizedStops as unknown as object,
      legs: routeResult.legs as unknown as object,
      route_geometry: routeResult.route_geometry as unknown as object,
      total_distance_m: routeResult.total_distance_m,
      total_duration_s: routeResult.total_duration_s,
      solver_time_ms: solverResult.solver_time_ms,
      time_limit_ms: timeLimitMs,
    },
  });

  logger.info('Optimization complete', {
    request_id: record.id,
    driver_id: driver.id,
    stop_count: stops.length,
    solver_time_ms: solverResult.solver_time_ms,
    total_distance_m: routeResult.total_distance_m,
  });

  return buildResponse(record);
}

export async function getOptimizationById(requestId: string): Promise<OptimizeResponse | null> {
  const record = await prisma.optimizationRequest.findUnique({
    where: { id: requestId },
  });
  if (!record) return null;
  return buildResponse(record);
}

export async function listOptimizations(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.optimizationRequest.findMany({
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        driver_id: true,
        driver_name: true,
        total_distance_m: true,
        total_duration_s: true,
        solver_time_ms: true,
        created_at: true,
      },
    }),
    prisma.optimizationRequest.count(),
  ]);

  return {
    data: items,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildResponse(record: any): OptimizeResponse {
  return {
    request_id: record.id,
    driver_id: record.driver_id,
    optimized_sequence: record.optimized_sequence as OptimizedStop[],
    legs: record.legs as OptimizeResponse['legs'],
    total_distance_m: record.total_distance_m,
    total_duration_s: record.total_duration_s,
    route_geometry: record.route_geometry as object,
    solver_time_ms: record.solver_time_ms,
    map_url: `/api/v1/optimize/${record.id}/map`,
    created_at: record.created_at.toISOString(),
  };
}
