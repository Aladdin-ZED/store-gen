/**
 * One timeline event as a sentence (platform.md PLA-§7.8): `console.timeline.<kind>` with its code-only variables
 * turned into labels (a reason, a status, a plan, a key, a mode, a milestone), a review as "<kind>: <status>", and an
 * unknown kind as the raw action name (the caller shows it in mono). Pure over a translator, so the Overview strip
 * (server) and the Activity tab (client) say the same words.
 *
 *   timelineSentence(t, { kind: "platform.store.restricted", vars: { reason: "fake_orders" } })   // "Restricted: Fake orders"
 */
import type { MessageVars } from "@/lib/i18n/admin";

type T = (key: string, vars?: MessageVars) => string;

/** A label when the catalog has one (`prefix` ends with a dot), else the value as it is. */
function labelOf(t: T, prefix: string, value: string | number | undefined): string {
  if (value === undefined || value === "") return "";
  const key = `${prefix}${value}`;
  const text = t(key);
  return text === key ? String(value) : text;
}

export function timelineSentence(t: T, e: { kind: string; vars: Record<string, string | number> }): { text: string; known: boolean } {
  const v = e.vars;
  if (e.kind.startsWith("review.")) {
    const [, kind, status] = e.kind.split(".");
    return {
      text: t("console.timeline.review", { kind: labelOf(t, "console.queue.kind.", kind), status: labelOf(t, "console.timeline.review_status.", status) + (v.reason ? ` · ${labelOf(t, "console.queue.reason_code.", v.reason)}` : "") }),
      known: true,
    };
  }
  const key = `console.timeline.${e.kind}`;
  const vars: MessageVars = {
    reason: v.reason !== undefined ? labelOf(t, "console.reason.", v.reason) : t("console.timeline.no_reason"),
    from: labelOf(t, "console.status.", v.from) || "?",
    to: labelOf(t, "console.status.", v.to) || "?",
    mode: labelOf(t, "console.mode.", v.mode) || "?",
    key: labelOf(t, "console.entitlement.", v.key) || "?",
    source: labelOf(t, "console.timeline.source.", v.source) || "?",
    milestone: labelOf(t, "console.milestone.", v.milestone) || "?",
    minutes: typeof v.minutes === "number" ? v.minutes : 0,
    plan: v.plan ?? "?",
  };
  if (e.kind.startsWith("view.") && v.reason !== undefined) vars.reason = labelOf(t, "console.impersonation.reason.", v.reason);
  const text = t(key, vars);
  return text === key ? { text: e.kind, known: false } : { text, known: true };
}
