import "server-only";
/**
 * The Mailer interface (docs/STORE-SAAS.md §B.10, R-D51, IN-08). Every caller has a non-mail path (the copy link
 * shown once, the WhatsApp share, the in-app notification), so mail is never the only way a message arrives.
 *
 *   R1 default   `mailer()` answers `{ enabled: false }` and `enqueue` sends nothing (`reason: "disabled"`)
 *   R1 optional  with SMTP_URL + MAIL_FROM set (src/lib/mail/smtp.ts), transactional mails go out directly through
 *                that relay (Hostinger SMTP): one try, in the background, deduplicated by `dedupeKey` for 24 h and
 *                capped at 20 per minute and 200 per hour per process; the `outboxId` is the send's own id
 *   R2           the transport moves behind the outbox (kind "mail", drained by the cron, §H.1) with the credentials in
 *                the encrypted platform setting `platform_mail`; the interface below does not change
 *
 * Signature frozen at C0a; T2 owns the folder (§K.1).
 */
import { newId } from "@/lib/db/ids";
import { errorSummary } from "@/lib/orders/log";
import { scopedCache } from "@/lib/tenancy/cache";
import { isMailAddress, sendSmtp, smtpConfigFromEnv, type SmtpConfig } from "./smtp";
import { renderMail } from "./templates";

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

const PER_MINUTE = 20;
const PER_HOUR = 200;
const DEDUPE_TTL_MS = 24 * 60 * 60_000;

/** Platform-keyed process state ("p", §E.6): sent dedupe keys and the two fixed-window counters. */
const sentKeys = scopedCache<true>({ name: "mail-dedupe", maxEntries: 5_000, ttlMs: DEDUPE_TTL_MS });
const windows = scopedCache<{ count: number }>({ name: "mail-caps", maxEntries: 8, ttlMs: 2 * 60 * 60_000 });

function withinCaps(now: number): boolean {
  const minute = windows.get("p", `m:${Math.floor(now / 60_000)}`) ?? windows.set("p", `m:${Math.floor(now / 60_000)}`, { count: 0 });
  const hour = windows.get("p", `h:${Math.floor(now / 3_600_000)}`) ?? windows.set("p", `h:${Math.floor(now / 3_600_000)}`, { count: 0 });
  if (minute.count >= PER_MINUTE || hour.count >= PER_HOUR) return false;
  minute.count++;
  hour.count++;
  return true;
}

/** Sends still running in this process (tests await them; nothing else needs to). */
const inflight: Promise<void>[] = [];

/** For tests and graceful shutdowns: waits for the background sends started so far. */
export async function settleMail(): Promise<void> {
  await Promise.allSettled(inflight.splice(0));
}

function smtpMailer(config: SmtpConfig): Mailer {
  return {
    enabled: true,
    async enqueue(msg) {
      if (!isMailAddress(msg.to) || !msg.dedupeKey) return { queued: false, reason: "suppressed" };
      const key = msg.dedupeKey.slice(0, 200);
      if (sentKeys.get("p", key)) return { queued: false, reason: "duplicate" };
      if (!withinCaps(Date.now())) return { queued: false, reason: "capped" };
      sentKeys.set("p", key, true);
      const brand = msg.vars.brand ?? (await import("@/lib/auth/platform-config").then((m) => m.brandName()).catch(() => "Store Gen"));
      const { subject, text } = renderMail(msg.template, msg.locale, { ...msg.vars, brand });
      const outboxId = `mail_${newId()}`;
      const job = sendSmtp(config, { to: msg.to, subject, text }).then(
        () => undefined,
        (err: unknown) => console.error(`[mail] ${msg.template} not sent (${outboxId}):`, errorSummary(err)),
      );
      inflight.push(job);
      void job.finally(() => {
        const at = inflight.indexOf(job);
        if (at !== -1) inflight.splice(at, 1);
      });
      return { queued: true, outboxId };
    },
  };
}

let cached: { url: string | undefined; from: string | undefined; mailer: Mailer } | null = null;
let problemLogged = false;

/** Disabled unless SMTP_URL and MAIL_FROM are both set and valid (a malformed pair is logged once, never its values). */
export function mailer(): Mailer {
  const url = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM;
  if (cached && cached.url === url && cached.from === from) return cached.mailer;
  const { config, problem } = smtpConfigFromEnv();
  if (problem && !problemLogged) {
    problemLogged = true;
    console.warn(`[mail] ${problem}; mail stays off`);
  }
  cached = { url, from, mailer: config ? smtpMailer(config) : DISABLED };
  return cached.mailer;
}
