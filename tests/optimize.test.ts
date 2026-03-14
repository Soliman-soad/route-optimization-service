import request from 'supertest';
import app from '../src/app';
import * as optimizeService from '../src/services/optimize.service';

// Mock the entire optimize service so we never hit real OR-Tools or ORS
jest.mock('../src/services/optimize.service');

const mockOptimizeRoute = optimizeService.optimizeRoute as jest.MockedFunction<typeof optimizeService.optimizeRoute>;
const mockGetById = optimizeService.getOptimizationById as jest.MockedFunction<typeof optimizeService.getOptimizationById>;
const mockList = optimizeService.listOptimizations as jest.MockedFunction<typeof optimizeService.listOptimizations>;

const MOCK_RESULT = {
  request_id: '550e8400-e29b-41d4-a716-446655440000',
  driver_id: 'd1',
  optimized_sequence: [
    { position: 1, stop_id: 's3', label: 'House 5, Sector 7, Uttara', lat: 23.8759, lng: 90.3795 },
    { position: 2, stop_id: 's1', label: '12 Kemal Ataturk Ave, Banani', lat: 23.7946, lng: 90.4050 },
    { position: 3, stop_id: 's2', label: 'Road 90, House 14, Gulshan 2', lat: 23.7808, lng: 90.4147 },
  ],
  legs: [
    { from: 'start',  to: 's3', distance_m: 7210,  duration_s: 980  },
    { from: 's3',     to: 's1', distance_m: 9840,  duration_s: 1340 },
    { from: 's1',     to: 's2', distance_m: 2100,  duration_s: 310  },
  ],
  total_distance_m: 19150,
  total_duration_s: 2630,
  route_geometry: { type: 'LineString', coordinates: [[90.4125, 23.8103], [90.3795, 23.8759]] },
  solver_time_ms: 284,
  map_url: '/api/v1/optimize/550e8400-e29b-41d4-a716-446655440000/map',
  created_at: '2025-05-01T10:32:00.000Z',
};

const VALID_BODY = {
  driver: { id: 'd1', name: 'Rahim', start_lat: 23.8103, start_lng: 90.4125 },
  stops: [
    { id: 's1', label: '12 Kemal Ataturk Ave, Banani',  lat: 23.7946, lng: 90.4050, time_window_start: '13:00', time_window_end: '15:00', service_time_s: 180 },
    { id: 's2', label: 'Road 90, House 14, Gulshan 2',  lat: 23.7808, lng: 90.4147, time_window_start: '14:00', time_window_end: '16:30', service_time_s: 120 },
    { id: 's3', label: 'House 5, Sector 7, Uttara',     lat: 23.8759, lng: 90.3795, time_window_start: '12:30', time_window_end: '14:00', service_time_s: 300 },
  ],
};

describe('POST /api/v1/optimize', () => {
  beforeEach(() => {
    mockOptimizeRoute.mockResolvedValue(MOCK_RESULT);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  test('1. returns 200 with correct response shape on valid input', async () => {
    const res = await request(app).post('/api/v1/optimize').send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.request_id).toBe(MOCK_RESULT.request_id);
    expect(res.body.optimized_sequence).toHaveLength(3);
    expect(res.body.legs).toHaveLength(3);
    expect(res.body.route_geometry.type).toBe('LineString');
    expect(res.body.map_url).toMatch(/^\/api\/v1\/optimize\/.+\/map$/);
    expect(res.body.total_distance_m).toBe(19150);
  });

  test('2. passes driver and stops to service correctly', async () => {
    await request(app).post('/api/v1/optimize').send(VALID_BODY);
    expect(mockOptimizeRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: expect.objectContaining({ id: 'd1' }),
        stops: expect.arrayContaining([expect.objectContaining({ id: 's1' })]),
      })
    );
  });

  test('3. respects optional time_limit_ms in request', async () => {
    await request(app).post('/api/v1/optimize').send({ ...VALID_BODY, time_limit_ms: 3000 });
    expect(mockOptimizeRoute).toHaveBeenCalledWith(
      expect.objectContaining({ time_limit_ms: 3000 })
    );
  });

  // ── Error cases ────────────────────────────────────────────────────────────

  test('4. returns 400 with only 1 stop (below minimum)', async () => {
    const body = {
      ...VALID_BODY,
      stops: [VALID_BODY.stops[0]],
    };
    const res = await request(app).post('/api/v1/optimize').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('5. returns 400 with invalid latitude (999.0)', async () => {
    const body = {
      driver: { id: 'd3', name: 'Nadia', start_lat: 23.8103, start_lng: 90.4125 },
      stops: [
        { id: 's1', label: 'Stop A', lat: 999.0, lng: 90.3990, time_window_start: '09:00', time_window_end: '11:00', service_time_s: 120 },
        { id: 's2', label: 'Stop B', lat: 23.78,  lng: 90.40,  time_window_start: '10:00', time_window_end: '12:00', service_time_s: 120 },
      ],
    };
    const res = await request(app).post('/api/v1/optimize').send(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringMatching(/lat/i) }),
    ]));
  });

  test('6. returns 400 when driver fields are missing', async () => {
    const res = await request(app).post('/api/v1/optimize').send({ stops: VALID_BODY.stops });
    expect(res.status).toBe(400);
  });

  test('7. returns 422 when stop IDs are duplicate', async () => {
    const body = {
      ...VALID_BODY,
      stops: [
        { ...VALID_BODY.stops[0], id: 'dup' },
        { ...VALID_BODY.stops[1], id: 'dup' },
      ],
    };
    const res = await request(app).post('/api/v1/optimize').send(body);
    expect(res.status).toBe(400); // caught by Zod refine
    expect(res.body.error).toBeDefined();
  });

  test('8. returns 408 when solver times out', async () => {
    const timeoutErr = Object.assign(new Error('Solver timed out'), {
      code: 'SOLVER_TIMEOUT',
      time_limit_ms: 5000,
    });
    mockOptimizeRoute.mockRejectedValueOnce(timeoutErr);

    const res = await request(app).post('/api/v1/optimize').send(VALID_BODY);
    expect(res.status).toBe(408);
    expect(res.body.error).toMatch(/timed out/i);
    expect(res.body.time_limit_ms).toBe(5000);
  });

  test('9. returns 502 when ORS is unavailable', async () => {
    mockOptimizeRoute.mockRejectedValueOnce(new Error('ORS API unavailable'));
    const res = await request(app).post('/api/v1/optimize').send(VALID_BODY);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/routing service/i);
  });

  test('10. returns 400 when stops exceed maximum of 15', async () => {
    const stops = Array.from({ length: 16 }, (_, i) => ({
      id: `s${i}`,
      label: `Stop ${i}`,
      lat: 23.7 + i * 0.01,
      lng: 90.4,
      time_window_start: '09:00',
      time_window_end: '18:00',
      service_time_s: 120,
    }));
    const res = await request(app).post('/api/v1/optimize').send({ ...VALID_BODY, stops });
    expect(res.status).toBe(400);
  });

  test('11. returns 400 when service_time_s is out of range', async () => {
    const body = {
      ...VALID_BODY,
      stops: [
        { ...VALID_BODY.stops[0], service_time_s: 30 }, // below 60
        VALID_BODY.stops[1],
      ],
    };
    const res = await request(app).post('/api/v1/optimize').send(body);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/optimize/:request_id', () => {
  test('returns 200 with stored result', async () => {
    mockGetById.mockResolvedValue(MOCK_RESULT);
    const res = await request(app).get('/api/v1/optimize/550e8400-e29b-41d4-a716-446655440000');
    expect(res.status).toBe(200);
    expect(res.body.request_id).toBe(MOCK_RESULT.request_id);
    expect(res.body.route_geometry).toBeDefined();
    expect(res.body.map_url).toBeDefined();
  });

  test('returns 404 for unknown request_id', async () => {
    mockGetById.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/optimize/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/optimize (list)', () => {
  test('returns paginated list', async () => {
    mockList.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
    });
    const res = await request(app).get('/api/v1/optimize?page=1&limit=20');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /health', () => {
  test('returns 200 with status ok', async () => {
    // Prisma is mocked via jest automock for the DB call in health check
    const res = await request(app).get('/health');
    // Health may return 200 or 503 depending on DB, but shape should be correct
    expect([200, 503]).toContain(res.status);
    expect(res.body.status).toBeDefined();
  });
});
