"use client";

import { useEffect, useState } from "react";
import { useAdminLocale } from "@/lib/i18n/admin/client";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 days ago" / "in 6 days" in the page language (Latin digits), the full date on hover; refreshed every minute. */
export function When({ iso, className }: { iso: string; className?: string }) {
  const locale = useAdminLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const at = new Date(iso).getTime();
  const diff = at - now;
  const rtf = new Intl.RelativeTimeFormat(`${locale}-u-nu-latn`, { numeric: "auto" });
  const unit = UNITS.find(([, ms]) => Math.abs(diff) >= ms);
  const text = unit ? rtf.format(Math.round(diff / unit[1]), unit[0]) : rtf.format(0, "minute");
  const full = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: "medium", timeStyle: "short" }).format(at);
  return (
    <time dateTime={iso} title={full} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}

/** A plain localised date ("24 Oct 2026"), Latin digits. */
export function DateText({ iso, className }: { iso: string; className?: string }) {
  const locale = useAdminLocale();
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: "medium" }).format(new Date(iso))}
    </time>
  );
}
