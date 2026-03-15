import axios, { AxiosError } from 'axios';
import logger from '../utils/logger';

const ORS_BASE = 'https://api.openrouteservice.org/v2';

export interface LegResult {
  from: string;
  to: string;
  distance_m: number;
  duration_s: number;
}

export interface RouteResult {
  legs: LegResult[];
  route_geometry: GeoJSONLineString;
  total_distance_m: number;
  total_duration_s: number;
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface MatrixResult {
  durations: number[][];
}

/** Stop as received in request, plus optional label for leg naming */
export interface CoordPoint {
  id: string;
  lat: number;
  lng: number;
}

/**
 * Call ORS Matrix API to get driving durations between all points.
 * Index 0 = driver start. Returns (N+1)x(N+1) duration matrix.
 * IMPORTANT: ORS uses [lng, lat] order.
 */
export async function getMatrix(points: CoordPoint[]): Promise<MatrixResult> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    throw new Error('ORS_API_KEY environment variable is not set');
  }

  // ORS expects [lng, lat]
  const locations = points.map((p) => [p.lng, p.lat]);

  

  try {
    const response = await axios.post(
      `${ORS_BASE}/matrix/driving-car`,
      { locations, metrics: ['duration'] },
      {
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    return { durations: response.data.durations as number[][] };
  } catch (err) {
    const message = extractAxiosError(err);
    logger.error('ORS Matrix API failed', { error: message });
    throw new Error(`ORS Matrix API unavailable: ${message}`);
  }
}

/**
 * Call ORS Directions API for the actual road polyline and per-leg stats.
 * Points must be in optimized order (driver start first).
 * IMPORTANT: ORS uses [lng, lat] order.
 */
export async function getDirections(
  orderedPoints: CoordPoint[],
  stopIds: string[]  // ids in order (first one is 'start', rest match points[1..])
): Promise<RouteResult> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    throw new Error('ORS_API_KEY environment variable is not set');
  }

  // ORS expects [lng, lat]
  const coordinates = orderedPoints.map((p) => [p.lng, p.lat]);

  try {
    const startTime = Date.now();
    const response = await axios.post(
      `${ORS_BASE}/directions/driving-car`,
      { coordinates },
      {
        headers: {
          Authorization: `${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    const orsTime = Date.now() - startTime;
    logger.info('ORS Directions call complete', { ors_time_ms: orsTime });

    const route = response.data.routes[0];
    if (!route) {
      throw new Error('ORS returned no routes');
    }

    // Extract GeoJSON geometry
    const geometry: GeoJSONLineString = route.geometry as GeoJSONLineString;

    // Extract per-leg info
    const segments: Array<{ distance: number; duration: number }> = route.segments ?? [];

    const legs: LegResult[] = segments.map((seg, i) => ({
      from: stopIds[i] ?? 'start',
      to: stopIds[i + 1] ?? 'unknown',
      distance_m: Math.round(seg.distance),
      duration_s: Math.round(seg.duration),
    }));

    const summary = route.summary;
    const total_distance_m = Math.round(summary.distance as number);
    const total_duration_s = Math.round(summary.duration as number);

    return { legs, route_geometry: geometry, total_distance_m, total_duration_s };
  } catch (err) {
    const message = extractAxiosError(err);
    logger.error('ORS Directions API failed', { error: message });
    throw new Error(`ORS Directions API unavailable: ${message}`);
  }
}

function extractAxiosError(err: unknown): string {
  if (err instanceof AxiosError) {
    if (err.response) {
      return `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
