/**
 * VRP Solver unit tests.
 * Mocks child_process.spawn so tests are deterministic and don't require Python/OR-Tools.
 */
const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

import { solveVRP } from '../src/solver/vrp.solver';

function mockSolverOutput(output: object) {
  mockSpawn.mockImplementation(() => {
    const stdoutListeners: ((chunk: Buffer) => void)[] = [];
    const closeListeners: (() => void)[] = [];

    return {
      stdin: {
        write(_data: string) {},
        end() {
          const out = JSON.stringify(output);
          stdoutListeners.forEach((fn) => fn(Buffer.from(out)));
          closeListeners.forEach((fn) => fn());
        },
      },
      stdout: {
        on(ev: string, fn: (chunk: Buffer) => void) {
          if (ev === 'data') stdoutListeners.push(fn);
        },
      },
      stderr: { on() {} },
      on(ev: string, fn: () => void) {
        if (ev === 'close') closeListeners.push(fn);
      },
      kill: jest.fn(),
    };
  });
}

function mockSolverError(errMsg: string) {
  mockSpawn.mockImplementation(() => {
    const errorListeners: ((err: Error) => void)[] = [];
    return {
      stdin: { write() {}, end() {} },
      stdout: { on() {} },
      stderr: { on() {} },
      on(ev: string, fn: (err: Error) => void) {
        if (ev === 'error') errorListeners.push(fn);
      },
      kill: jest.fn(),
    };
  });
  // Emit error on next tick so the solver has registered the listener
  setImmediate(() => {
    const child = mockSpawn.mock.results[mockSpawn.mock.results.length - 1]?.value;
    if (child?.on) {
      const listeners = (child as any)._errorListeners ?? [];
      listeners.forEach((fn: (e: Error) => void) => fn(new Error(errMsg)));
    }
  });
}

// Simulate process error by having spawn return a child that emits 'error' when end() is called
function mockSolverProcessError(errMsg: string) {
  mockSpawn.mockImplementation(() => {
    const errorListeners: ((err: Error) => void)[] = [];
    return {
      stdin: {
        write() {},
        end() {
          errorListeners.forEach((fn) => fn(new Error(errMsg)));
        },
      },
      stdout: { on() {} },
      stderr: { on() {} },
      on(ev: string, fn: (err: Error) => void) {
        if (ev === 'error') errorListeners.push(fn);
      },
      kill: jest.fn(),
    };
  });
}

const STOPS = [
  { id: 's1', label: 'Banani', lat: 23.7946, lng: 90.4050, time_window_start: '13:00', time_window_end: '15:00', service_time_s: 180 },
  { id: 's2', label: 'Gulshan', lat: 23.7808, lng: 90.4147, time_window_start: '14:00', time_window_end: '16:30', service_time_s: 120 },
  { id: 's3', label: 'Uttara', lat: 23.8759, lng: 90.3795, time_window_start: '12:30', time_window_end: '14:00', service_time_s: 300 },
];

const DURATION_MATRIX = [
  [0, 980, 1340, 720],
  [850, 0, 620, 890],
  [1200, 590, 0, 1050],
  [700, 870, 1010, 0],
];

describe('vrp.solver — solveVRP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  test('4. handles process error gracefully', async () => {
    mockSolverProcessError('python3: command not found');

    const result = await solveVRP(STOPS, DURATION_MATRIX, 5000);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Solver process failed/);
  });

  test('5. includes solver_time_ms in all responses', async () => {
    mockSolverOutput({
      success: true,
      sequence: [
        { node_index: 0, stop_id: 's1', arrival_s: 0 },
        { node_index: 1, stop_id: 's2', arrival_s: 1000 },
        { node_index: 2, stop_id: 's3', arrival_s: 2000 },
      ],
      solver_time_ms: 342,
    });

    const result = await solveVRP(STOPS, DURATION_MATRIX, 5000);
    expect(typeof result.solver_time_ms).toBe('number');
    expect(result.solver_time_ms).toBe(342);
  });
});
