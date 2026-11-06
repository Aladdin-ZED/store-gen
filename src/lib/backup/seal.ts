/**
 * The backup part envelope (docs/STORE-SAAS.md §H.6; R1 P8 step 9): one AES-256-GCM binary envelope per gzip part
 * through `sealBytes` / `openBytes` (CCR r1-p8-3, applied at P0b: magic "SGB2"), key scope `platform`, purpose
 * `backup:v1`. A part never opens under another scope or purpose, and a changed byte fails the tag. Without the
 * owner's APP_SECRET no part opens at all.
 */
import { openBytes, sealBytes } from "@/lib/security/crypto";

export const BACKUP_PURPOSE = "backup:v1";

/** gzip bytes → the part file's bytes */
export function sealPart(gz: Buffer): Buffer {
  return sealBytes(gz, "platform", BACKUP_PURPOSE);
}

/** the part file's bytes → its gzip bytes; throws on anything else (a tampered, truncated or foreign file) */
export function openPart(buf: Buffer): Buffer {
  return openBytes(buf, "platform", BACKUP_PURPOSE);
}
