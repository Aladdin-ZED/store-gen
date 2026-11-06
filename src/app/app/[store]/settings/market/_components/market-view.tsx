"use client";
/**
 * Settings → Market on screen (P2 SHELL; platform.md PLA-§22.10.5): the fixed market and currency with their note,
 * the formats preview (a sample amount, today's date and the time in the store's language and time zone: the format
 * only, never a price of the store), the time-zone link, and the order defaults card.
 *
 * Money is integer cents on screen and in this component; T4's `defaults` key keeps its two-decimal major unit, so the
 * fee is divided by 100 only when it is sent.
 */
import { ArrowUpRightIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { BusyButton, ErrorSummary, FactRow, Facts, Field, FIELD_INPUT, NativeSelect, SettingsCard } from "@/components/admin/common/settings-kit";
import { FOCUS_RING } from "@/components/admin/common/ui-classes";
import type { ActionResult } from "@/components/admin/lib/action-result";
import { useActionError } from "@/components/admin/shell/use-action-error";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { SettingInput } from "@/lib/settings/schemas";
import { cn } from "@/lib/utils";

type Lang = "ar" | "fr" | "en";
const PHONE_COUNTRIES = ["MA", "DZ", "TN", "SN", "CI", "FR", "BE", "ES"] as const;
/** At most 100,000.00 for a default delivery fee (the schema's own bound is wider). */
const FEE_MAX_CENTS = 10_000_000;

function regionName(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "35", "35.5", "35,50" → 3550; null when it is not an amount with at most two decimals. Pure. */
function parseCents(raw: string): number | null {
  const v = raw.trim().replace(",", ".");
  if (v === "") return 0;
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(v)) return null;
  const [whole = "0", frac = ""] = v.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const centsText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

export function MarketView({
  market,
  currency,
  storeLocale,
  timeZone,
  preview,
  generalHref,
  defaults,
  canWrite,
  save,
}: {
  market: string;
  currency: string;
  storeLocale: Lang;
  timeZone: string;
  /** the sample amount, today's date and the time, formatted on the server in the store's language and time zone */
  preview: { amount: string; date: string; time: string };
  generalHref: string;
  defaults: {
    phoneCountry: string;
    shippingFeeCents: number;
    deliveryText: string;
  };
  canWrite: boolean;
  save(input: SettingInput<"defaults">): Promise<ActionResult<null>>;
}) {
  const t = useT();
  const viewer = useAdminLocale();
  const router = useRouter();
  const actions = useActionError();
  const [phoneCountry, setPhoneCountry] = useState(defaults.phoneCountry);
  const [fee, setFee] = useState(centsText(defaults.shippingFeeCents));
  const [deliveryText, setDeliveryText] = useState(defaults.deliveryText);
  const [savedState, setSavedState] = useState({
    phoneCountry: defaults.phoneCountry,
    fee: centsText(defaults.shippingFeeCents),
    deliveryText: defaults.deliveryText,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = phoneCountry !== savedState.phoneCountry || fee !== savedState.fee || deliveryText !== savedState.deliveryText;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || busy || !dirty) return;
    const cents = parseCents(fee);
    const next: Record<string, string> = {};
    if (cents === null || cents > FEE_MAX_CENTS) next.fee = "shell.market.fee_invalid";
    if (deliveryText.length > 140) next.deliveryText = "shell.form.too_long";
    setErrors(next);
    if (Object.keys(next).length || cents === null) return;
    setBusy(true);
    try {
      const res = await actions.run(() =>
        save({
          market: market as SettingInput<"defaults">["market"],
          currency,
          locale: storeLocale,
          phoneCountry,
          shippingFee: cents / 100,
          deliveryText: deliveryText.trim(),
        }),
      );
      if (res.ok) {
        setSavedState({
          phoneCountry,
          fee: centsText(cents),
          deliveryText: deliveryText.trim(),
        });
        setFee(centsText(cents));
        toast.success(t("shell.general.saved"));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsCard title={t("shell.market.title")} description={t("shell.market.lead")}>
        <Facts>
          <FactRow label={t("shell.market.market")} action={<LockIcon aria-label={t("shell.market.fixed_short")} className="size-3.5 text-muted-foreground" />}>
            {regionName(viewer, market)}
          </FactRow>
          <FactRow label={t("shell.market.currency")} action={<LockIcon aria-label={t("shell.market.fixed_short")} className="size-3.5 text-muted-foreground" />}>
            <bdi dir="ltr" className="font-mono text-[13px]">
              {currency}
            </bdi>
          </FactRow>
        </Facts>
        <p className="rounded-[var(--r-control)] bg-muted/50 px-3.5 py-2.5 text-[13px] text-muted-foreground">{t("shell.market.fixed")}</p>
      </SettingsCard>

      <SettingsCard
        title={t("shell.market.formats")}
        description={t("shell.market.formats_lead", {
          language: t(`shell.lang.${storeLocale}`),
        })}
        actions={
          <Link
            href={generalHref}
            className={cn("inline-flex min-h-9 items-center gap-1 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline", FOCUS_RING)}
          >
            {t("shell.market.timezone_link")}
            <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: t("shell.market.preview_amount"), value: preview.amount },
            { label: t("shell.market.preview_date"), value: preview.date },
            { label: t("shell.market.preview_time"), value: preview.time },
          ].map((p) => (
            <div key={p.label} className="grid content-start gap-1 rounded-[var(--r-control)] bg-muted/50 px-3.5 py-3">
              <span className="text-xs text-muted-foreground">{p.label}</span>
              {/* the value as the store's pages write it; the card itself follows the admin's direction */}
              <bdi lang={storeLocale} dir={storeLocale === "ar" ? "rtl" : "ltr"} className="justify-self-start text-sm font-medium tabular-nums">
                {p.value || "·"}
              </bdi>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("shell.market.timezone_now")} <bdi dir="ltr">{timeZone.replace(/_/g, " ")}</bdi>
        </p>
      </SettingsCard>

      <form onSubmit={submit} noValidate className="contents">
        <SettingsCard
          title={t("shell.market.defaults")}
          description={t("shell.market.defaults_lead")}
          footer={
            canWrite ? (
              <BusyButton type="submit" variant="brand" busy={busy} disabled={!dirty}>
                {t("shell.form.save")}
              </BusyButton>
            ) : (
              <p className="me-auto text-[13px] text-muted-foreground">{t("shell.form.read_only")}</p>
            )
          }
        >
          <ErrorSummary
            errors={errors}
            labels={{
              fee: t("shell.market.fee"),
              deliveryText: t("shell.market.delivery_text"),
            }}
          />
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field label={t("shell.market.phone_country")} hint={t("shell.market.phone_country_hint")}>
              {(p) => (
                <NativeSelect {...p} value={phoneCountry} disabled={!canWrite} onChange={(e) => setPhoneCountry(e.target.value)}>
                  {PHONE_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {regionName(viewer, c)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t("shell.market.fee")} hint={t("shell.market.fee_hint", { currency })} error={errors.fee}>
              {(p) => (
                <Input {...p} className={cn(FIELD_INPUT, "tabular-nums")} inputMode="decimal" dir="ltr" value={fee} disabled={!canWrite} onChange={(e) => setFee(e.target.value)} />
              )}
            </Field>
            <Field label={t("shell.market.delivery_text")} optional hint={t("shell.market.delivery_text_hint")} error={errors.deliveryText} className="sm:col-span-2">
              {(p) => <Input {...p} className={FIELD_INPUT} maxLength={140} value={deliveryText} disabled={!canWrite} onChange={(e) => setDeliveryText(e.target.value)} />}
            </Field>
          </div>
        </SettingsCard>
      </form>
    </>
  );
}
