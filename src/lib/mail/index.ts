import "server-only";
/**
 * The Mailer interface (docs/STORE-SAAS.md §B.10, R-D51, IN-08). Every caller has a non-mail path (copy link, in-app
 * notification), so R1 ships with mail off: `mailer()` answers `{ enabled: false }` and `enqueue` never sends. R2
 * implements the transport (outbox kind "mail" drained by the cron, Hostinger SMTP in the encrypted `platform_mail`
 * setting, per-minute and per-hour caps, transactional only).
 *
 * Signature frozen at C0a; T2 owns the folder (§K.1). The R1 body below is the documented behaviour, not a stub.
 */

export type MailTemplateId =
  | "invite"
  | "staff_invite"
  | "password_reset"
  | "signup_received"
  | "signup_approved"
  | "signup_rejected"
  | "impersonation_notice"
  | "store_status"
  | "export_ready"
  | "digest"
  | "payout_ready"; // R2, OPE Q.13d

export interface MailMessage {
  to: string;
  locale: "ar" | "fr" | "en";
  template: MailTemplateId;
  vars: Record<string, string>;
  storeId?: string | null;
  dedupeKey: string;
}

export interface Mailer {
  readonly enabled: boolean;
  enqueue(msg: MailMessage): Promise<{ queued: true; outboxId: string } | { queued: false; reason: "disabled" | "capped" | "duplicate" | "suppressed" }>;
}

const DISABLED: Mailer = {
  enabled: false,
  async enqueue() {
    return { queued: false, reason: "disabled" };
  },
};

/** R1: always disabled. */
export function mailer(): Mailer {
  return DISABLED;
}
