import "server-only";
/**
 * Messages to stores (platform.md PLA-§19.1, R1): "Message" on the store profile (one store) and on the stores list's
 * bulk bar (admin+, at most 50 stores).
 *
 *   const r = await messageStores(ctx, { storeIds, text, link, audience: "owners", severity: "info" });
 *
 * Plain text ≤ 600 characters, an optional link (an `/app/<handle>/…` path or an https URL, shown as text), the
 * audience owners or owners + admins, severity info or warn. Each store gets one `staff.message` notification with
 * the text (never an e-mail in R1) and one audit row `platform.store.messaged { count }`. Support may message one
 * store at a time (`notify.stores`). A store that is purged or has no handle is skipped.
 */
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { recordPlatformError } from "./log";
import { notify } from "./notify";

export const MESSAGE_MAX = 600;
export const MESSAGE_STORES_MAX = 50;

const linkOk = (v: string) => /^\/app\/[a-z0-9-]{3,30}(\/[A-Za-z0-9/_.?=&%-]*)?$/.test(v) || /^https:\/\/[^\s/$.?#][^\s]*$/i.test(v);

export const MessageInput = z.object({
  storeIds: z
    .array(z.string().regex(/^[0-9A-Z]{26}$/))
    .min(1)
    .max(MESSAGE_STORES_MAX),
  text: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim())
    .pipe(z.string().min(1).max(MESSAGE_MAX)),
  link: z.string().trim().max(300).refine(linkOk, "invalid link").optional(),
  audience: z.enum(["owners", "owners_admins"]).default("owners"),
  severity: z.enum(["info", "warn"]).default("info"),
});
export type MessageInput = z.input<typeof MessageInput>;

/** `notify.stores`: one notification and one audit row per store; support one store at a time. */
export async function messageStores(ctx: PlatformCtx, input: unknown): Promise<{ sent: string[]; skipped: string[] }> {
  if (!ctx.can("notify.stores")) throw new AuthRefusal("forbidden");
  const parsed = MessageInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "text")]: "console.message.invalid" });
  const v = parsed.data;
  // an https link travels as text under the message (never a clickable notification link, PLA-§19.1)
  const text = v.link && !v.link.startsWith("/app/") ? [v.text, v.link].join("\n") : v.text;
  if (text.length > MESSAGE_MAX) throw new FieldsError({ text: "console.message.too_long" });
  const ids = [...new Set(v.storeIds)];
  if (ids.length > 1 && ctx.role !== "admin" && ctx.role !== "super_admin") throw new AuthRefusal("forbidden", "console.message.one_store");
  const rows = await db.select({ id: stores.id, handle: stores.handle, status: stores.status }).from(stores).where(inArray(stores.id, ids));
  const sendable = new Set(rows.filter((r) => r.handle && r.status !== "purged").map((r) => r.id));
  const sent: string[] = [];
  const skipped = ids.filter((id) => !sendable.has(id));
  const roles = v.audience === "owners" ? (["owner"] as const) : (["owner", "admin"] as const);
  for (const storeId of ids.filter((id) => sendable.has(id))) {
    try {
      await notify({ audience: "store_role", storeId, roles }, "staff.message", {}, { text, severity: v.severity, ...(v.link?.startsWith("/app/") ? { link: v.link } : {}) });
      await audit("platform.store.messaged", { userId: ctx.user.id, target: storeId, meta: { count: 1, audience: v.audience, severity: v.severity, ...(v.link ? { hasLink: true } : {}) }, ip: ctx.actor.ip, scope: { storeId, actorKind: "platform" } });
      sent.push(storeId);
    } catch (err) {
      recordPlatformError("message store", err, { storeId });
      skipped.push(storeId);
    }
  }
  return { sent, skipped };
}
