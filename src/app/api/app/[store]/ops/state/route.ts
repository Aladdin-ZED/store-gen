/**
 * GET /api/app/<handle>/ops/state?view=queue|board (OD33; operations.md OPE-§14.1, §27.3, §M.2). Two polled payloads,
 * never a write (the presence heartbeat is `POST /ops/presence`):
 *
 *   view=board   orders.read_all: the manager board (tiles from `queueCounts`, the agents table, the sheet agents, the
 *                best-hours strip), polled every 15 s while visible
 *   view=queue   agents.self: the viewer's callbacks and the end-of-day line
 *
 * Both are cached 5 s (per store; per viewer for the queue) by src/lib/callcenter/board.server.ts. The ETag is the
 * hash of the payload, so a poll that changed nothing answers 304 with no body.
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { failure } from "@/lib/callcenter/hotpath";
import { boardState, queueState } from "@/lib/callcenter/board.server";
import { apiHeaders } from "@/lib/orders/http";
import { storeGuard } from "@/lib/tenancy/seam";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

const QUEUE = "queue";
const QUEUE_KEY = "agents.self";
const viewOf = (req: NextRequest): "queue" | "board" => (req.nextUrl.searchParams.get("view") === QUEUE ? QUEUE : "board");

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  // the board's key is the first literal of the call (the default view; the tenancy harness reads it from the source)
  const g = await storeGuard(req, (await params).store, viewOf(req) === QUEUE ? QUEUE_KEY : "orders.read_all");
  if (!g.ok) return g.response;
  const view = viewOf(req);
  try {
    const body = JSON.stringify(view === "queue" ? await queueState(g.ctx.scope, g.ctx.user.id) : await boardState(g.ctx.scope));
    const etag = `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
    const headers = apiHeaders({ ETag: etag, Vary: "Cookie" });
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(body, { status: 200, headers });
  } catch (err) {
    return failure(err, "ops:state");
  }
}

