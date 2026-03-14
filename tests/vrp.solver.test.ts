/**
 * VRP Solver unit tests.
 * We mock child_process.execFile so these tests are deterministic
 * and don't require Python/OR-Tools installed in the test environment.
 *
 * vrp.solver.ts calls promisify(execFile). Since promisify is called at
 * module load time, we intercept by mocking the entire child_process module
 * before the module is imported, using jest.mock hoisting.
 */

// Must be declared before imports due to jest.mock hoisting
const mockExecFile = jest.fn();

jest.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// Also mock util so promisify returns a function that delegates to mockExecFile
jest.mock('util', () => {
  const actual = jest.requireActual<typeof import('util')>('util');
  return {
    ...actual,
    promisify: (fn: Function) => {
      // Return the promisified mock only for execFile-like functions
      if (fn.toString().includes('execFile') || fn === mockExecFile) {
        return (...args: unknown[]) =>
          new Promise((resolve, reject) => {
            mockExecFile(...args, (err: Error | null, stdout: string, stderr: string) => {
              if (err) reject(err);
              else resolve({ stdout, stderr });
            });
          });
      }
      return actual.promisify(fn);
    },
  };
});

import { solveVRP } from '../src/solver/vrp.solver';

// Helper to mock execFile resolving with a given stdout
function mockSolverOutput(output: object) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, callback: Function) => {
      callback(null, JSON.stringify(output), '');
    }
  );
}

function mockSolverError(errMsg: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, callback: Function) => {
      callback(new Error(errMsg), '', errMsg);
    }
  );
}

const STOPS = [
  { id: 's1', label: 'Banani',  lat: 23.7946, lng: 90.4050, time_window_start: '13:00', time_window_end: '15:00', service_time_s: 180 },
  { id: 's2', label: 'Gulshan', lat: 23.7808, lng: 90.4147, time_window_start: '14:00', time_window_end: '16:30', service_time_s: 120 },
  { id: 's3', label: 'Uttara',  lat: 23.8759, lng: 90.3795, time_window_start: '12:30', time_window_end: '14:00', service_time_s: 300 },
];

// 4x4 duration matrix (depot + 3 stops)
const DURATION_MATRIX = [
  [0,    980,  1340, 720],
  [850,  0,    620,  890],
  [1200, 590,  0,    1050],
  [700,  870,  1010, 0],
];

describe('vrp.solver — solveVRP', () => {
  test('1. returns success=true with correct sequence for known input', async () => {
    const mockOutput = {
      success: true,
      sequence: [
        { node_index: 2, stop_id: 's3', arrival_s: 45000 },
        { node_index: 0, stop_id: 's1', arrival_s: 46800 },
        { node_index: 1, stop_id: 's2', arrival_s: 50400 },
      ],
      solver_time_ms: 123,
    };
    mockSolverOutput(mockOutput);

    const result = await solveVRP(STOPS, DURATION_MATRIX, 5000);

    expect(result.success).toBe(true);
    expect(result.solver_time_ms).toBe(123);
    expect(result.sequence).toHaveLength(3);
    expect(result.sequence[0].stop_id).toBe('s3');
    expect(result.sequence[1].stop_id).toBe('s1');
    expect(result.sequence[2].stop_id).toBe('s2');
  });

  test('2. returns sequence items with stop_id and arrival_s fields', async () => {
    const mockOutput = {
      success: true,
      sequence: [
        { node_index: 0, stop_id: 's1', arrival_s: 46800 },
        { node_index: 1, stop_id: 's2', arrival_s: 50400 },
        { node_index: 2, stop_id: 's3', arrival_s: 52200 },
      ],
      solver_time_ms: 88,
    };
    mockSolverOutput(mockOutput);

    const result = await solveVRP(STOPS, DURATION_MATRIX, 5000);

    result.sequence.forEach((item) => {
      expect(item).toHaveProperty('stop_id');
      expect(item).toHaveProperty('arrival_s');
      expect(item).toHaveProperty('node_index');
    });
  });

  test('3. returns success=false when solver finds no solution', async () => {
    mockSolverOutput({ success: false, error: 'No solution found', solver_time_ms: 5000 });

    const result = await solveVRP(STOPS, DURATION_MATRIX, 5000);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('4. handles Python process crash gracefully', async () => {
    mockSolverError('python3: command not found');

    const result = await solveVRP(STOPS, DURATION_MATRIX, 5000);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Solver process failed/);
  });

  test('5. includes solver_time_ms in all responses', async () => {
    mockSolverOutput({
      success: true,
      sequence: [{ node_index: 0, stop_id: 's1', arrival_s: 0 }, { node_index: 1, stop_id: 's2', arrival_s: 1000 }, { node_index: 2, stop_id: 's3', arrival_s: 2000 }],
      solver_time_ms: 342,
    });

    const result = await solveVRP(STOPS, DURATION_MATRIX, 5000);
    expect(typeof result.solver_time_ms).toBe('number');
  });
});
