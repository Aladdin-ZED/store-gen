"use client";
/**
 * Last result per pixel with a server token (operations.md OPE-§20.7): its state word, the last send or refusal in
 * plain words, this week's sent / refused (with the platform's code) / too-old counts, each with its n, and "Send test
 * event" (the library's own test, `sendTestEventAction`). Counts are the store's own outbox rows, never an estimate.
 */
import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { sendTestEventAction } from "@/app/app/[store]/integrations/pixels/actions";
import { Button } from "@/components/ui/button";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { ServerEventsPixel } from "@/lib/pixels/server-events-shared";
import { HEALTH_TONE, num, platformName, relTime } from "../integrations/hub-format";
import { useNow } from "../integrations/hub-states";
import { StateBadge } from "../integrations/state-badge";

export function PixelResults({ pixels, canWrite, now: serverNow }: { pixels: ServerEventsPixel[]; canWrite: boolean; now: number }) {
  const t = useT();
  const locale = useAdminLocale();
  const now = useNow(serverNow);
  const [testing, setTesting] = useState<string | null>(null);

  async function test(p: ServerEventsPixel) {
    const key = `${p.platform}:${p.id}`;
    if (testing) return;
    setTesting(key);
    try {
      const res = await sendTestEventAction({ platform: p.platform, id: p.id });
      const name = platformName(p.platform);
      if (!res.ok) toast.error(t(res.message ?? `error.${res.error}`));
      else if (res.data.ok) toast.success(t("int.px.test.ok", { platform: name }));
      else toast.error(res.data.status === null ? t("int.px.test.unreachable", { platform: name }) : t("int.px.test.refused", { platform: name, status: res.data.status }));
    } catch {
      toast.error(t("int.sheets.network"));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{t("int.px.results.title")}</p>
        <p className="text-xs text-muted-foreground">{t("int.px.results.window")}</p>
      </div>
      <ul className="grid gap-2.5">
        {pixels.map((p) => {
          const key = `${p.platform}:${p.id}`;
          const st = p.status;
          const state = st?.state ?? "new";
          return (
            <li key={key} className="grid gap-3 rounded-2xl p-4 ring-1 ring-foreground/[0.07] ring-inset">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-0.5">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-[-0.01em]">
                    <span className="truncate" title={p.label}>
                      {p.label}
                    </span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">{platformName(p.platform)}</span>
                  </p>
                  <p className="text-xs text-pretty text-muted-foreground">
                    {st?.lastErrorAt && (!st.lastOkAt || st.lastErrorAt > st.lastOkAt)
                      ? t("int.px.results.lastRefused", { ago: relTime(st.lastErrorAt, locale, now), cause: t(st.lastErrorKey ?? "int.cause.unknown") })
                      : st?.lastOkAt
                        ? t("int.px.results.lastSent", { ago: relTime(st.lastOkAt, locale, now) })
                        : t("int.px.results.never")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StateBadge tone={HEALTH_TONE[state] ?? "neutral"}>{t(`int.health.state.${state}`)}</StateBadge>
                  {canWrite && (
                    <Button variant="outline" className="h-11 px-3 sm:h-8" disabled={testing !== null} onClick={() => void test(p)}>
                      {testing === key ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <FlaskConicalIcon aria-hidden="true" />}
                      {t("int.px.test")}
                    </Button>
                  )}
                </div>
              </div>

              {p.week === "error" ? (
                <p className="text-xs text-muted-foreground">{t("int.px.results.weekError")}</p>
              ) : (
                <>
                  <dl className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["sent", p.week.sent, "text-foreground"],
                        ["refused", p.week.refused, p.week.refused ? "text-destructive" : "text-foreground"],
                        ["stale", p.week.stale, "text-foreground"],
                      ] as const
                    ).map(([k, n, tone]) => (
                      <div key={k} className="grid gap-0.5 rounded-xl bg-foreground/[0.025] px-3 py-2">
                        <dt className="text-[11px] font-medium text-muted-foreground">{t(`int.px.results.${k}`)}</dt>
                        <dd className={`text-base font-semibold tabular-nums ${tone}`}>{num(n, locale)}</dd>
                      </div>
                    ))}
                  </dl>
                  {p.week.reasons.length > 0 && (
                    <ul className="grid gap-1">
                      {p.week.reasons.map((r, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80 tabular-nums">{t("int.px.results.times", { n: r.n })}</span>
                          <span>{t(r.causeKey ?? "int.cause.unknown")}</span>
                          {r.status !== null && <code className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[11px]" dir="ltr">HTTP {r.status}</code>}
                          {r.platformCode && (
                            <code className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[11px]" dir="ltr">
                              {t("int.px.results.code", { code: r.platformCode })}
                            </code>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.week.stale > 0 && <p className="text-xs text-pretty text-muted-foreground">{t("int.px.results.staleHelp")}</p>}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
