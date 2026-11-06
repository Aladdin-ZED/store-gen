import "server-only";
/**
 * The edge tally into the error ring (docs/STORE-SAAS.md §H.5 `edge`, §C.2 step 2; CCR r1-p8-8 item 4; P8 step 11).
 * src/proxy.ts never touches the database (R-D6), so its per-process tally (src/lib/edge/proxy-log.ts `edgeTally()`)
 * is turned into `error_events` rows here, from the Node-runtime paths P8 owns: the end of every tick (before the
 * ring's flush) and every `getHealth()`.
 *
 *   recordEdgeDeltas();   // → recordError("edge", null, { code: "bad_key" | "prev_key" | "foreign_host" }) per new event
 *
 * - `bad_key`: every unverifiable `x-sg-edge` since the last look (the tally's three reasons summed).
 * - `prev_key`: the tally keeps only the last EDGE_KEY_PREV request's time, so a look counts at most one per change:
 *   `prevKeyRequests24h` is therefore "looks that saw a prev-key request", a lower bound, never an invented number.
 * - `foreign_host`: the hosts the proxy logged once each; counted when the tally exposes `foreignHosts` (CCR r1-p8-23),
 *   until then nothing is recorded and getHealth lists `edge.foreignHosts24h` as not measured.
 * - What was recorded lives in `__sgOpsMetrics.edgeSeen` (./metrics.ts), so the tick and the health route of one
 *   process never record the same event twice. A tally that went backwards (a test reset) is taken as the new start.
 * - At most 1,000 rows of one code per look: a flood stays bounded (the ring has its own 500-key bound too).
 */
import { edgeTally, type EdgeTally } from "@/lib/edge/proxy-log";
import { recordError } from "./errors";
import { edgeSeen, setEdgeSeen, type EdgeSeen } from "./metrics";

const MAX_PER_LOOK = 1_000;

/** The tally's fields CCR r1-p8-23 adds (read when present, so nothing changes here once it lands). */
type TallyPlus = EdgeTally & { foreignHosts?: unknown; workerVersion?: unknown };

/** The foreign-host count of the tally, or null while proxy-log.ts does not expose it. */
export function tallyForeignHosts(t: EdgeTally): number | null {
  const n = (t as TallyPlus).foreignHosts;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** The last `x-sg-worker` the tally saw, or null (not exposed yet, or never seen). */
export function tallyWorkerVersion(t: EdgeTally): string | null {
  const v = (t as TallyPlus).workerVersion;
  return typeof v === "string" && /^[A-Za-z0-9._-]{1,32}$/.test(v) ? v : null;
}

const badKeyTotal = (t: EdgeTally) => t.badKey.bad_key + t.badKey.stale + t.badKey.unconfigured;

/** The events of `tally` not recorded yet against `seen` (pure; test:jobs). */
export function edgeDeltas(tally: EdgeTally, seen: EdgeSeen | null): { badKey: number; prevKey: number; foreignHosts: number; next: EdgeSeen } {
  const base = seen ?? { badKey: 0, prevKeyAt: null, foreignHosts: 0 };
  const bad = badKeyTotal(tally);
  const foreign = tallyForeignHosts(tally) ?? 0;
  const badKey = bad >= base.badKey ? bad - base.badKey : bad;
  const foreignHosts = foreign >= base.foreignHosts ? foreign - base.foreignHosts : foreign;
  const prevKey = tally.prevKeyAt !== null && tally.prevKeyAt !== base.prevKeyAt ? 1 : 0;
  return { badKey, prevKey, foreignHosts, next: { badKey: bad, prevKeyAt: tally.prevKeyAt, foreignHosts: foreign } };
}

/** Records the edge events since the last look in the error ring (never throws); returns what it recorded. */
export function recordEdgeDeltas(): { badKey: number; prevKey: number; foreignHosts: number } {
  try {
    const d = edgeDeltas(edgeTally(), edgeSeen());
    setEdgeSeen(d.next);
    const emit = (code: string, n: number) => {
      for (let i = 0; i < Math.min(n, MAX_PER_LOOK); i++) recordError("edge", null, { code });
    };
    emit("bad_key", d.badKey);
    emit("prev_key", d.prevKey);
    emit("foreign_host", d.foreignHosts);
    return { badKey: d.badKey, prevKey: d.prevKey, foreignHosts: d.foreignHosts };
  } catch {
    return { badKey: 0, prevKey: 0, foreignHosts: 0 };
  }
}
