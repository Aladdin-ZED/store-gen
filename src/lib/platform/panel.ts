import "server-only";
/**
 * One console panel's answer (platform.md PLA-§4.5 "States", §5.1, §7.3): every block of the overview and every strip
 * of a store profile reads its own source and fails alone. A source that throws `not implemented` is a P0 stub of a
 * track that merges later: the panel says "unavailable" (never a made-up 0, build note item 14); any other throw is
 * the panel's error state with an 8-character reference (the `error_events` dedupe prefix once P8's `recordError`
 * lands, CCR r1-p1-3 item 3) and one redacted log line.
 *
 *   const strip = await panel("strip.orders", () => loadOrdersStrip(scope), { storeId });
 *   if (strip.state === "ok") …   // "unavailable" | "error" render their own quiet states
 */
import { createHash } from "node:crypto";
import { errorSummary } from "@/lib/orders/log";
import { recordPlatformError } from "./log";

export type Panel<T> =
  | { state: "ok"; data: T; at: string }
  /** the source is a stub of a track that merges later (or a feature of a later release) */
  | { state: "unavailable"; at: string }
  /** the source failed: the panel shows "This panel couldn't load", Retry and `ref` */
  | { state: "error"; ref: string; at: string };

export const isNotImplemented = (err: unknown): boolean => err instanceof Error && err.message.startsWith("not implemented");

/** The panel's error reference: 8 hex of sha256(where | summary), stable for one failure kind, never a bound value. */
export function errorRef(where: string, err: unknown): string {
  return createHash("sha256").update(`${where}|${errorSummary(err)}`, "utf8").digest("hex").slice(0, 8);
}

/** Runs one panel's loader: its data, "unavailable" for a stub, or the error state (logged, redacted). */
export async function panel<T>(where: string, load: () => Promise<T>, opts: { storeId?: string } = {}): Promise<Panel<T>> {
  try {
    const data = await load();
    return { state: "ok", data, at: new Date().toISOString() };
  } catch (err) {
    const at = new Date().toISOString();
    if (isNotImplemented(err)) return { state: "unavailable", at };
    recordPlatformError(where, err, opts.storeId ? { storeId: opts.storeId } : {});
    return { state: "error", ref: errorRef(where, err), at };
  }
}

/** A secondary source of a panel: its value, or null when it is a stub or fails (the failure is logged). */
export async function optional<T>(where: string, load: () => Promise<T>, opts: { storeId?: string } = {}): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (!isNotImplemented(err)) recordPlatformError(where, err, opts.storeId ? { storeId: opts.storeId } : {});
    return null;
  }
}

/** The data of a panel, or null for its other states. */
export const dataOf = <T>(p: Panel<T>): T | null => (p.state === "ok" ? p.data : null);
