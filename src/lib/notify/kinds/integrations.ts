/**
 * Notification kinds of the integrations track (P5 INTEGRATIONS, operations.md OPE-§21.4).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3; PLA-§18.1), created empty at P0 and imported by
 * src/lib/notify/registry.ts; texts `notify.<kind>.*` live in the track's own i18n file (D67), in ar, fr and en.
 *
 * Sent by src/lib/integrations/status.ts to the store's owners and admins:
 *   - `int.sheets_failing`, `int.capi_failing`, `int.telegram_failing`: a target turned `failing`, once per incident
 *     per hour (the writer's dedupe key carries the hour);
 *   - `int.delivery_dead`: outbox items that will not be retried, one row per store and outbox kind per 60 minutes.
 * `vars` carry codes and counts only: the cause code (rendered as `int.cause.<code>` by the screens), minutes, items.
 */
import { z } from "zod";
import { appHref } from "@/lib/urls";
import type { NotificationKindDef } from "../registry";

const failing = z.object({
  /** a cause code (src/lib/integrations/causes.ts) */
  code: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  /** minutes since the first failure of the incident */
  sinceMinutes: z.number().int().min(0),
  /** sheets: orders waiting */
  backlog: z.number().int().min(0).optional(),
});

const dead = z.object({
  kind: z.enum(["capi", "telegram", "webhook", "carrier", "whatsapp"]),
  count: z.number().int().min(1),
});

const to = (path: `/${string}`) => (_vars: unknown, ctx: { handle: string | null }) => (ctx.handle ? appHref(ctx.handle, path) : "");

const failingKind = (kind: string): NotificationKindDef => ({
  kind,
  group: "integrations",
  defaultSeverity: "danger",
  audienceHint: "store_role",
  vars: failing,
  link: to("/integrations"),
  tenant: true,
});

export const kinds: NotificationKindDef[] = [
  failingKind("int.sheets_failing"),
  failingKind("int.capi_failing"),
  failingKind("int.telegram_failing"),
  {
    kind: "int.delivery_dead",
    group: "integrations",
    defaultSeverity: "warn",
    audienceHint: "store_role",
    vars: dead,
    link: to("/integrations#deliveries"),
    tenant: true,
    batch: { windowMin: 60 },
  },
];
