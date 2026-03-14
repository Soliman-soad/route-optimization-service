import { spawn } from "child_process";
import path from "path";
import logger from "../utils/logger";

export interface StopInput {
  id: string;
  label: string;
  lat: number;
  lng: number;
  time_window_start: string; // "HH:MM"
  time_window_end: string;   // "HH:MM"
  service_time_s: number;
}

export interface SolverInput {
  duration_matrix: number[][];
  stops: Array<{
    id: string;
    label: string;
    lat: number;
    lng: number;
    time_window_start_s: number;
    time_window_end_s: number;
    service_time_s: number;
  }>;
  time_limit_ms: number;
}

export interface SequenceItem {
  node_index: number;
  stop_id: string;
  arrival_s: number;
}

export interface SolverResult {
  success: boolean;
  sequence: SequenceItem[];
  solver_time_ms: number;
  error?: string;
}

/** Parse "HH:MM" into seconds since midnight */
function timeToSeconds(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return h * 3600 + m * 60;
}

/** Invoke the Python OR-Tools solver via child_process */
export async function solveVRP(
  stops: StopInput[],
  durationMatrix: number[][],
  timeLimitMs: number
): Promise<SolverResult> {
  const scriptPath = path.join(__dirname, 'vrp_solver.py');

  const solverInput: SolverInput = {
    duration_matrix: durationMatrix,
    stops: stops.map((s) => ({
      id: s.id,
      label: s.label,
      lat: s.lat,
      lng: s.lng,
      time_window_start_s: timeToSeconds(s.time_window_start),
      time_window_end_s: timeToSeconds(s.time_window_end),
      service_time_s: s.service_time_s,
    })),
    time_limit_ms: timeLimitMs,
  };

  const inputJson = JSON.stringify(solverInput);

  return new Promise<SolverResult>((resolve) => {
    const child = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("VRP solver execution failed", { error: message });
      resolve({
        success: false,
        sequence: [],
        solver_time_ms: 0,
        error: `Solver process failed: ${message}`,
      });
    });

    const killTimeout = setTimeout(() => {
      logger.error("VRP solver timed out", { timeLimitMs });
      child.kill();
      resolve({
        success: false,
        sequence: [],
        solver_time_ms: timeLimitMs,
        error: "Solver timed out",
      });
    }, timeLimitMs + 10000);

    child.on("close", () => {
      clearTimeout(killTimeout);

      if (stderr) {
        logger.warn("VRP solver stderr", { stderr });
      }

      try {
        const result: SolverResult = JSON.parse(stdout.trim());
        resolve(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("VRP solver JSON parse failed", {
          error: message,
          stdout,
        });
        resolve({
          success: false,
          sequence: [],
          solver_time_ms: 0,
          error: `Solver JSON parse failed: ${message}`,
        });
      }
    });

    child.stdin.write(inputJson);
    child.stdin.end();
  });
}
