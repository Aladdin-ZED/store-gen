import "server-only";
/**
 * The public liveness answer of `GET /api/health` (docs/STORE-SAAS.md §H.5, D45, QA-01): `{ ok, app: "store-gen", db,
 * build }`. `db` is one `SELECT 1` bounded to 2 s; `build` the first 8 characters of `.next/BUILD_ID` ("dev" without a
 * build). Nothing about stores, users or configuration. The staff health view is P8's `getHealth()`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface PublicHealth {
  ok: boolean;
  app: "store-gen";
  db: "ok" | "down";
  build: string;
}

const DB_TIMEOUT_MS = 2_000;
let buildId: string | null = null;

function build(): string {
  if (buildId === null) {
    try {
      buildId = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim().slice(0, 8) || "dev";
    } catch {
      buildId = "dev";
    }
  }
  return buildId;
}

async function dbUp(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const probe = db.execute(sql`SELECT 1`).then(
      () => true,
      () => false,
    );
    const timeout = new Promise<boolean>((done) => {
      timer = setTimeout(() => done(false), DB_TIMEOUT_MS);
    });
    return await Promise.race([probe, timeout]);
  } catch {
    // DATABASE_URL unset: the pool cannot even be created
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function publicHealth(): Promise<PublicHealth> {
  const up = await dbUp();
  return { ok: up, app: "store-gen", db: up ? "ok" : "down", build: build() };
}
