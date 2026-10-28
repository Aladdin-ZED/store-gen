import "server-only";
/**
 * The per-store run recorder (docs/STORE-SAAS.md §H.2: "store-level jobs: one job_runs row per store visited when it
 * did work"; R1 P8). The runner opens a recorder around each job run; forEachStore (./scope.ts) reports every store it
 * visits to the recorder of the async context it runs in, so a job gets its per-store rows without passing anything
 * through its own code. Outside a run (a request path, a script) nothing records.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** One store visited by forEachStore inside a job run. */
export interface StoreVisit {
  storeId: string;
  /** epoch ms */
  startedAt: number;
  ms: number;
  ok: boolean;
  /** what the step reported (a number it returned), else 0 */
  processed: number;
  /** errorCode() of the thrown error */
  errorCode: string | null;
  /** the store had work: the step returned a positive count, threw, or was picked by a `where` predicate */
  worked: boolean;
}

export interface RunRecorder {
  visit(v: StoreVisit): void;
}

const recorders = new AsyncLocalStorage<RunRecorder>();

/** Runs `fn` with `rec` receiving the store visits made inside it (the runner, around one job run). */
export function recordingVisits<T>(rec: RunRecorder, fn: () => Promise<T>): Promise<T> {
  return recorders.run(rec, fn);
}

/** Reports one visit to the current run's recorder, if any (forEachStore). Never throws. */
export function recordStoreVisit(v: StoreVisit): void {
  try {
    recorders.getStore()?.visit(v);
  } catch {
    // recording must never fail the store's step
  }
}
