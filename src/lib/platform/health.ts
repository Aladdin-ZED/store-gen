import "server-only";
/**
 * Platform health data (P8 PLATFORM OPS; docs/STORE-SAAS.md §H.5, OS-09; platform.md PLA-§15, PLA Q.25; §K.2 P0): what
 * the console's `/admin/health` panels and the `platform.alarms` job read. P8 owns the data, P1 the screens and the
 * alarms. Typed stub frozen at P0 with the core §H.5 field list and PLA Q.25's `edge`, `commerce` and `sheetsTop`.
 */
import type { DbUsage } from "@/lib/db/usage";
import type { OutboxKind, OutboxState } from "@/lib/jobs/outbox";
import type { RenderSummary } from "@/lib/jobs/renders";
import type { PlatformCtx } from "@/lib/tenancy/types";

export interface JobRunSummary {
  at: string;
  ms: number;
  ok: boolean;
  processed: number;
  errorCode: string | null;
}

export interface PlatformHealth {
  at: string;
  /** the last tick and the last 50 `job_runs` per job */
  cron: { lastTickAt: string | null; lastTickMs: number | null; lastTickOk: boolean | null; jobs: { job: string; budgetMs: number | null; runs: JobRunSummary[] }[] };
  /** outbox depth by kind and state, and the oldest pending item per store */
  outbox: { byKind: { kind: OutboxKind; state: OutboxState; count: number }[]; oldestPending: { storeId: string | null; kind: OutboxKind; at: string }[] };
  renders: RenderSummary;
  /** Sheets backlog per store */
  sheets: { storeId: string; pending: number; oldestPendingAt: string | null; lastPushAt: string | null; lastPullAt: string | null }[];
  /** total vs quota (`getDbUsage`), per table (`information_schema.tables`) and per store (`store_usage`) */
  storage: { db: DbUsage | null; tables: { name: string; bytes: number }[]; stores: { storeId: string; bytes: number }[] };
  /** `DATA_DIR` from the bounded walk (ENGC-14), not live */
  dataDir: { bytes: number; budgetBytes: number | null; files: number };
  /** `error_events` of the last 24 h */
  errors24h: { area: string; code: string; route: string | null; count: number; stores: number; firstAt: string; lastAt: string }[];
  runtime: { node: string; memory: { rss: number; heapUsed: number; heapTotal: number }; uptimeSec: number; bootWarnings: string[] };
  /** rev 2 (PLA Q.25), rev 4 `badKey24h` */
  edge: { sMode: boolean; workerVersion: string | null; lastEdgeAt: string | null; prevKeyRequests24h: number; badKey24h: number; foreignHosts24h: number };
  /** rev 3 (SEC-10): the build id (`.next/BUILD_ID`) and the offline gate's commit logged at boot */
  build: { id: string | null; gateSha: string | null; gateAt: string | null };
  /** rev 3 (ENGC-12) */
  db: { poolWaitP95Ms: number | null; lockPoolWaitP95Ms: number | null };
  /** rev 3 (ENGC-11) */
  tick: { lagP95Ms: number | null; skipped24h: number };
  /** PLA Q.25: the last order platform-wide and orders per hour for 24 h (test orders excluded) */
  commerce: { lastOrderAt: string | null; ordersPerHour24: number[] };
  /** PLA Q.25: the stores with the oldest Sheets backlog */
  sheetsTop: { storeId: string; oldestMin: number }[];
  /** P7's `aiHealth()` (AI R13, R18); its type is ai.md's, typed open until the P7 contract entries */
  ai: Readonly<Record<string, unknown>> | null;
  /** DES-R12: the design tables' bytes (alarm at 300 MB) */
  design: { genomesBytes: number; shinglesBytes: number };
  /** the `platform.health` job (§I.7) */
  health: { staleSnapshots: number; dirtyRows: number };
}

export async function getHealth(ctx: PlatformCtx): Promise<PlatformHealth> {
  void ctx;
  throw new Error("not implemented: P8 getHealth");
}
