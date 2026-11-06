/**
 * The client-safe half of src/lib/pixels/server-events.ts (Connect → Pixels → Server events, OPE-§20.7): the view's
 * types and constants the card imports without pulling the server read into a client bundle.
 */
import type { IntegrationHealthRow } from "@/lib/integrations/health";
import type { ConversionsSetting } from "@/lib/settings/keys/conversions";
import type { MessageKey } from "@/lib/tenancy/types";
import type { ServerPlatform } from "./ids";

export type PurchaseTrigger = ConversionsSetting["purchaseTrigger"];
export const PURCHASE_TRIGGERS = ["order", "confirmed", "delivered"] as const satisfies readonly PurchaseTrigger[];
/** OPE-§20.2: ≤ 200 per-page overrides (the setting's own limit) */
export const OVERRIDES_MAX = 200;
export const SERVER_EVENTS_WEEK_DAYS = 7;

export interface ServerEventsPage {
  id: string;
  name: string;
  live: boolean;
}

/** One refusal reason of the week: the cause in plain words, the HTTP status and the platform's own code. */
export interface RefusedReason {
  causeKey: MessageKey | null;
  status: number | null;
  /** "190" or "190/463" (Meta), "40001" (TikTok); null when the answer carried none */
  platformCode: string | null;
  n: number;
}

export interface ServerEventsPixel {
  platform: ServerPlatform;
  id: string;
  label: string;
  /** the integration_status row of this pixel; null before its first server event */
  status: Pick<IntegrationHealthRow, "state" | "lastOkAt" | "lastErrorAt" | "lastErrorKey" | "failures"> | null;
  week: { sent: number; refused: number; stale: number; reasons: RefusedReason[] } | "error";
  /** a test event code is saved: "Send test event" lands in the platform's test tool */
  testCode: boolean;
}

export interface ReexportRow {
  id: string;
  pageId: string;
  pageName: string;
  mode: "connected" | "php";
  createdAt: string;
}

export interface ServerEventsView {
  conversions: ConversionsSetting | "error";
  pages: ServerEventsPage[] | "error";
  pixels: ServerEventsPixel[];
  reexport: ReexportRow[] | "error";
  updating: number | null;
}
