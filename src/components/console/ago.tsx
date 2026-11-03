"use client";
/**
 * A relative time in console copy ("3 h 12 min ago", or a template like "Since {ago}") that stays fresh, with the
 * absolute platform time on hover (PLA-§4.5 "Time"). The server renders its own now; the client corrects it after
 * hydration without a warning.
 *
 *   <Ago iso={row.at} />                                   // "12 min ago"
 *   <Ago iso={row.since} template="console.attention.since" />  // "Since 2 h ago"
 */
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/i18n/admin";
import { absoluteTime, durationText } from "./format";
import { useConsoleShell, useNow } from "./shell/context";

export function useAgo(): (iso: string, now: number) => string {
  const t = useT();
  return (iso, now) => {
    const d = durationText(now - Date.parse(iso));
    return d ? t("console.time.ago", { d }) : t("console.time.now");
  };
}

export function Ago({ iso, template, className }: { iso: string; template?: MessageKey; className?: string }) {
  const t = useT();
  const { timeZone } = useConsoleShell();
  const now = useNow(30_000);
  const ago = useAgo()(iso, now);
  return (
    <time dateTime={iso} title={absoluteTime(iso, timeZone)} className={className} suppressHydrationWarning>
      {template ? t(template, { ago }) : ago}
    </time>
  );
}
