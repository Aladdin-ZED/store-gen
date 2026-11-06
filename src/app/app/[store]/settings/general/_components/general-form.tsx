"use client";
/**
 * Settings → General, the store card (P2 SHELL; platform.md PLA-§22.10.1, TN-09, PD70; brief p2-10 FORM RULES):
 * name, legal name, category, default language and time zone, then the store id (Copy) and the creation date.
 *
 * - A time-zone change asks first ("Today" and every daily number follow it): the confirm sheet, then the save.
 * - `brand_protected` (an exact protected brand in the name or the legal name) opens the brand sheet with the
 *   sentence of the limit sheet's brand variant; nothing was saved, the field keeps its error.
 * - Field errors show under the field and in the summary; Enter submits; the button keeps its width while busy.
 */
import { CalendarIcon, ShieldAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/admin/common/confirm-dialog";
import { CopyButton } from "@/components/admin/common/copy-button";
import { formatDay } from "@/components/admin/common/primitive-logic";
import { BusyButton, ErrorSummary, FactRow, Facts, Field, FIELD_INPUT, NativeSelect, SettingsCard } from "@/components/admin/common/settings-kit";
import { LEGAL_NAME_MAX, STORE_NAME_MAX } from "@/components/admin/shell/action-inputs";
import { useActionError } from "@/components/admin/shell/use-action-error";
import type { ActionResult } from "@/lib/tenancy/types";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { PRODUCT_CATEGORIES } from "@/lib/page/schema";

type Lang = "ar" | "fr" | "en";
export interface GeneralValues {
  name: string;
  legalName: string;
  category: string | null;
  defaultLocale: Lang;
  timezone: string;
}

const LANGS: readonly Lang[] = ["ar", "fr", "en"];
/** The zones offered first: the R1 market's, then the browser's full list. */
const FIRST_ZONES = ["Africa/Casablanca"];

function zoneList(current: string): string[] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    all = [];
  }
  return [...new Set([...FIRST_ZONES, current, ...all])];
}

export function GeneralForm({
  initial,
  storeId,
  createdAt,
  canWrite,
  save,
}: {
  initial: GeneralValues;
  storeId: string;
  createdAt: string;
  canWrite: boolean;
  save(input: { name?: string; legalName?: string | null; category?: string | null; defaultLocale?: Lang; timezone?: string }): Promise<ActionResult<{ fields: string[] }>>;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const actions = useActionError();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmZone, setConfirmZone] = useState(false);
  const [brandSheet, setBrandSheet] = useState(false);
  const zones = useMemo(() => zoneList(initial.timezone), [initial.timezone]);
  const dirty = (Object.keys(values) as (keyof GeneralValues)[]).some((k) => values[k] !== saved[k]);

  const set = <K extends keyof GeneralValues>(key: K, value: GeneralValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!values.name.trim()) e.name = "shell.form.required";
    return e;
  };

  const write = async () => {
    setBusy(true);
    try {
      // only what changed: an unchanged category or time zone is never sent (CCR r1-p2-4: their writer is the core's)
      const input: Parameters<typeof save>[0] = {};
      if (values.name !== saved.name) input.name = values.name.trim();
      if (values.legalName !== saved.legalName) input.legalName = values.legalName.trim() || null;
      if (values.category !== saved.category) input.category = values.category;
      if (values.defaultLocale !== saved.defaultLocale) input.defaultLocale = values.defaultLocale;
      if (values.timezone !== saved.timezone) input.timezone = values.timezone;
      const res = await save(input);
      if (res.ok) {
        setSaved(values);
        toast.success(t("shell.general.saved"));
        router.refresh();
        return;
      }
      if (res.error === "brand_protected") {
        setErrors({
          [input.name !== undefined ? "name" : "legalName"]: "shell.general.brand_field",
        });
        setBrandSheet(true);
        return;
      }
      if (res.error === "invalid") {
        const fields = Object.fromEntries((res.items ?? []).flatMap((i) => (i.field ? [[i.field, String(i.title)] as const] : [])));
        if (Object.keys(fields).length) {
          setErrors(fields);
          return;
        }
      }
      actions.show(res);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || busy || !dirty) return;
    const e2 = validate();
    setErrors(e2);
    if (Object.keys(e2).length) return;
    if (values.timezone !== saved.timezone) setConfirmZone(true);
    else void write();
  };

  const labels = {
    name: t("shell.general.name"),
    legalName: t("shell.general.legal_name"),
    category: t("shell.general.category"),
    timezone: t("shell.general.timezone"),
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="contents">
        <SettingsCard
          title={t("shell.general.store_title")}
          description={t("shell.general.store_lead")}
          footer={
            canWrite ? (
              <>
                {dirty && (
                  <button type="button" onClick={() => (setValues(saved), setErrors({}))} className="me-auto text-[13px] text-muted-foreground hover:text-foreground">
                    {t("shell.form.discard")}
                  </button>
                )}
                <BusyButton type="submit" variant="brand" busy={busy} disabled={!dirty}>
                  {t("shell.form.save")}
                </BusyButton>
              </>
            ) : (
              <p className="me-auto text-[13px] text-muted-foreground">{t("shell.form.read_only")}</p>
            )
          }
        >
          <ErrorSummary errors={errors} labels={labels} />
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field label={labels.name} error={errors.name} className="sm:col-span-2">
              {(p) => (
                <Input {...p} className={FIELD_INPUT} value={values.name} maxLength={STORE_NAME_MAX} disabled={!canWrite} autoComplete="organization" onChange={(e) => set("name", e.target.value)} />
              )}
            </Field>
            <Field label={labels.legalName} optional hint={t("shell.general.legal_name_hint")} error={errors.legalName} className="sm:col-span-2">
              {(p) => <Input {...p} className={FIELD_INPUT} value={values.legalName} maxLength={LEGAL_NAME_MAX} disabled={!canWrite} onChange={(e) => set("legalName", e.target.value)} />}
            </Field>
            <Field label={labels.category} error={errors.category} hint={t("shell.general.category_hint")}>
              {(p) => (
                <NativeSelect {...p} value={values.category ?? ""} disabled={!canWrite} onChange={(e) => set("category", e.target.value || null)}>
                  <option value="">{t("shell.general.category_none")}</option>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`shell.category.${c.replace("-", "_")}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t("shell.general.language")} hint={t("shell.general.language_hint")}>
              {(p) => (
                <NativeSelect {...p} value={values.defaultLocale} disabled={!canWrite} onChange={(e) => set("defaultLocale", e.target.value as Lang)}>
                  {LANGS.map((l) => (
                    <option key={l} value={l}>
                      {t(`shell.lang.${l}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={labels.timezone} error={errors.timezone} hint={t("shell.general.timezone_hint")} className="sm:col-span-2">
              {(p) => (
                <NativeSelect {...p} dir="ltr" value={values.timezone} disabled={!canWrite} onChange={(e) => set("timezone", e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Facts>
            <FactRow label={t("shell.general.store_id")} action={<CopyButton value={storeId} label={t("shell.general.copy_id")} toastMessage={t("shell.address.copied")} />}>
              <bdi dir="ltr" className="font-mono text-[13px] tracking-tight">
                {storeId}
              </bdi>
            </FactRow>
            <FactRow label={t("shell.general.created")}>
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                {formatDay(createdAt, locale)}
              </span>
            </FactRow>
          </Facts>
        </SettingsCard>
      </form>
      <ConfirmDialog
        open={confirmZone}
        onOpenChange={setConfirmZone}
        icon={<CalendarIcon />}
        title={t("shell.general.timezone_confirm")}
        description={t("shell.general.timezone_lead")}
        confirmLabel={t("shell.general.timezone_apply", {
          zone: values.timezone.replace(/_/g, " "),
        })}
        onConfirm={async () => {
          await write();
        }}
      />
      <ConfirmDialog
        open={brandSheet}
        onOpenChange={setBrandSheet}
        icon={<ShieldAlertIcon />}
        title={t("shell.general.brand_title")}
        description={t("shell.limit.brand_protected")}
        confirmLabel={t("shell.general.brand_ok")}
        onConfirm={async () => undefined}
      />
    </>
  );
}
