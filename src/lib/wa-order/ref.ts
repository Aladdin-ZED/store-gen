/**
 * The reference of an "Order on WhatsApp" intent (P3 LANDING; landing.md LAN-§11.4 step 4): `WA-` + 6 Crockford
 * base-32 characters (32^6 ≈ 1.07 billion), written in the shopper's message and typed back by agents in ⌘K. Unique
 * per store through `leads_store_ref_uq`: the writer (./create.server.ts) draws a new one on a duplicate, 3 times.
 */
import { randomBytes } from "node:crypto";
import { WA_REF_RE } from "./contract";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A fresh reference (each character from 5 random bits: no modulo bias). */
export function newWaRef(bytes: (n: number) => Uint8Array = randomBytes): string {
  const b = bytes(6);
  let out = "WA-";
  for (let i = 0; i < 6; i++) out += CROCKFORD[b[i]! & 31];
  return out;
}

export const isWaRef = (v: unknown): v is string => typeof v === "string" && WA_REF_RE.test(v);

/** How many references the writer draws before it gives up (LAN-§11.4). */
export const WA_REF_TRIES = 3;
