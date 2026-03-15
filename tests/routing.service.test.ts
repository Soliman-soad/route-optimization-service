import axios from 'axios';
import { getMatrix, getDirections } from '../src/services/routing.service';

jest.mock('axios');
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Set ORS key env var
beforeAll(() => {
  process.env['ORS_API_KEY'] = 'test-api-key';
});

afterAll(() => {
  delete process.env['ORS_API_KEY'];
});

const POINTS = [
  { id: 'start', lat: 23.8103, lng: 90.4125 },
  { id: 's1',    lat: 23.7946, lng: 90.4050 },
  { id: 's2',    lat: 23.7808, lng: 90.4147 },
  { id: 's3',    lat: 23.8759, lng: 90.3795 },
];

describe('routing.service — getMatrix', () => {
  test('1. sends coordinates in [lng, lat] order to ORS', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { durations: [[0, 980, 1340, 720], [850, 0, 620, 890], [1200, 590, 0, 1050], [700, 870, 1010, 0]] },
    });

    await getMatrix(POINTS);

    const callArgs = mockedAxios.post.mock.calls[0];
    const body = callArgs[1] as { locations: [number, number][] };

    // Verify each location is sent as [lng, lat], NOT [lat, lng]
    expect(body.locations[0]).toEqual([90.4125, 23.8103]); // [lng, lat]
    expect(body.locations[1]).toEqual([90.4050, 23.7946]);
    expect(body.locations[2]).toEqual([90.4147, 23.7808]);
  });

  test('2. returns correctly shaped duration matrix', async () => {
    const mockDurations = [[0, 980], [850, 0]];
    mockedAxios.post.mockResolvedValueOnce({ data: { durations: mockDurations } });

    const result = await getMatrix(POINTS.slice(0, 2));
    expect(result.durations).toEqual(mockDurations);
    expect(result.durations).toHaveLength(2);
    expect(result.durations[0]).toHaveLength(2);
  });

  test('3. throws on ORS network error', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Network Error'));
    await expect(getMatrix(POINTS)).rejects.toThrow('ORS Matrix API unavailable');
  });
});

describe('routing.service — getDirections', () => {
  const mockOrsResponse = {
    data: {
      routes: [{
        geometry: {
          type: 'LineString',
          coordinates: [[90.4125, 23.8103], [90.3795, 23.8759], [90.4050, 23.7946], [90.4147, 23.7808]],
        },
        segments: [
          { distance: 7210.5, duration: 980.3 },
          { distance: 9840.0, duration: 1340.0 },
          { distance: 2100.2, duration: 310.1 },
        ],
        summary: { distance: 19150.7, duration: 2630.4 },
      }],
    },
  };

  test('4. sends coordinates in [lng, lat] order', async () => {
    mockedAxios.post.mockResolvedValueOnce(mockOrsResponse);

    const stopIds = ['start', 's3', 's1', 's2'];
    await getDirections(POINTS, stopIds);

    const callArgs = mockedAxios.post.mock.calls[0];
    const body = callArgs[1] as { coordinates: [number, number][] };

    expect(body.coordinates[0]).toEqual([90.4125, 23.8103]); // driver [lng, lat]
    expect(body.coordinates[1]).toEqual([90.4050, 23.7946]); // stop 1
  });

  test('5. parses legs with correct from/to IDs', async () => {
    mockedAxios.post.mockResolvedValueOnce(mockOrsResponse);

    const stopIds = ['start', 's3', 's1', 's2'];
    const result = await getDirections(POINTS, stopIds);

    expect(result.legs).toHaveLength(3);
    expect(result.legs[0].from).toBe('start');
    expect(result.legs[0].to).toBe('s3');
    expect(result.legs[1].from).toBe('s3');
    expect(result.legs[1].to).toBe('s1');
  });

  test('6. rounds distances and durations to integers', async () => {
    mockedAxios.post.mockResolvedValueOnce(mockOrsResponse);

    const stopIds = ['start', 's3', 's1', 's2'];
    const result = await getDirections(POINTS, stopIds);

    expect(result.legs[0].distance_m).toBe(7211); // Math.round(7210.5)
    expect(result.legs[0].duration_s).toBe(980);  // Math.round(980.3)
    expect(result.total_distance_m).toBe(19151);
    expect(result.total_duration_s).toBe(2630);
  });

  test('7. returns valid GeoJSON LineString geometry', async () => {
    mockedAxios.post.mockResolvedValueOnce(mockOrsResponse);

    const stopIds = ['start', 's3', 's1', 's2'];
    const result = await getDirections(POINTS, stopIds);

    expect(result.route_geometry.type).toBe('LineString');
    expect(Array.isArray(result.route_geometry.coordinates)).toBe(true);
    expect(result.route_geometry.coordinates.length).toBeGreaterThan(0);
  });

  test('8. throws on ORS API error', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Request failed with status 429'));
    await expect(getDirections(POINTS, ['start', 's1'])).rejects.toThrow(
      'ORS Directions API unavailable'
    );
  });
});
