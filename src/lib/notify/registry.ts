/**
 * Notification kinds (docs/STORE-SAAS.md §I.4; platform.md PLA-§18.1). Isomorphic. Each track declares its kinds in
 * `src/lib/notify/kinds/<track>.ts` (exporting `kinds: NotificationKindDef[]`); this registry imports them (the
 * maintainer pre-writes the import lines at P0, §K.3). Titles and bodies are the message keys
 * `notify.<kind>.title` / `.body`, rendered in the reader's locale; tenant-facing kinds exist in ar, fr and en
 * (`test:i18n-coverage`). `vars` carry ids, counts, codes and short labels, never customer data (`test:platform`
 * refuses a vars key named phone, name, address, email or note).
 *
 * `notify()` itself is src/lib/platform/notify.ts (T2's minimal insert in R1.0, P1's from R1 product).
 */
import type { z } from "zod";
import { kinds as aiKinds } from "./kinds/ai";
import { kinds as integrationsKinds } from "./kinds/integrations";
import { kinds as landingKinds } from "./kinds/landing";
import { kinds as opsKinds } from "./kinds/ops";
import { kinds as platformKinds } from "./kinds/platform";

export type NotificationGroup = "store" | "security" | "orders" | "team" | "integrations" | "ai" | "health" | "platform" | (string & {});
export type NotificationSeverity = "info" | "success" | "warn" | "danger";
export type NotificationAudienceHint = "user" | "store" | "store_role" | "platform_staff";

export interface NotificationKindDef<V extends Record<string, unknown> = Record<string, unknown>> {
  kind: string; // "<area>.<event>", e.g. "signup.approved", "ops.new_orders"
  group: NotificationGroup;
  defaultSeverity: NotificationSeverity;
  audienceHint: NotificationAudienceHint;
  vars: z.ZodType<V>;
  /** an in-app path (validated again at notify() time: /app/<h>…, /app/account…, /admin…; anything else is stored NULL) */
  link?: (vars: V, ctx: { handle: string | null }) => string;
  tenant: boolean; // shown in the tenant notification centre (ar/fr/en required)
  batch?: { windowMin: number }; // one row per window, `count` incremented (dedupe_key)
}

/** A registered kind's name. Kept a string until the track files exist; P0 narrows it to the registered union. */
export type NotificationKind = string;
export type NotificationVars<K extends NotificationKind> = K extends NotificationKind ? Record<string, string | number | boolean | null> : never;

/** Every declared kind, in track order (P1, P3, P4, P5, P7; written at P0, `scripts/qa/registries-check.ts` proves none is left out). */
export const NOTIFICATION_KINDS: readonly NotificationKindDef[] = [...platformKinds, ...landingKinds, ...opsKinds, ...integrationsKinds, ...aiKinds];

export function notificationKind(kind: string): NotificationKindDef | undefined {
  return NOTIFICATION_KINDS.find((k) => k.kind === kind);
}

/** The link patterns notify() accepts (rev 4, PLA Q4.3: the dashboard root /app/<h> included); SEC-6. */
export const NOTIFY_LINK_RES: readonly RegExp[] = [/^\/app\/[a-z0-9-]{3,30}(?:[/?#]|$)/, /^\/app\/account(?:[/?#]|$)/, /^\/admin(?:[/?#]|$)/];

/** A link a notification may carry, else null (stored NULL, never rewritten). */
export function safeNotifyLink(link: string | null | undefined): string | null {
  if (!link || link.length > 300) return null;
  return NOTIFY_LINK_RES.some((re) => re.test(link)) ? link : null;
}
