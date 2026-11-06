"use client";
/**
 * Settings → General, contact and legal details (P2 SHELL; platform.md PLA-§22.10.1; health rules shell:contact and
 * shell:legal_identity link here): the logo (`brand.write`), WhatsApp, phone, e-mail, address, city and country, the
 * Moroccan ICE / RC and the social profiles. Saved by T4's `saveStoreAction` (the `store` key and the brand logo), sent
 * with the stored store name and legal name so those two keep their own brand-checked writer (the store card above).
 * The values are checked with the same `StoreSettings` schema first; an error is a catalog key under its field. The
 * calling hours are not here (D73): one line links to the call center where they are set.
 */
import { ImageIcon, PhoneCallIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { BusyButton, ErrorSummary, Field, FIELD_INPUT, NativeSelect, SettingsCard } from "@/components/admin/common/settings-kit";
import { FOCUS_RING } from "@/components/admin/common/ui-classes";
import type { PickedAsset } from "@/components/admin/media/MediaPicker";
import { MediaPicker } from "@/components/admin/on-demand";
import { useActionError } from "@/components/admin/shell/use-action-error";
import type { ActionResult } from "@/components/admin/lib/action-result";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { StoreSettings, type SettingInput } from "@/lib/settings/schemas";
import { cn } from "@/lib/utils";

type StoreInput = SettingInput<"store">;
type TextKey = "phone" | "whatsapp" | "email" | "address" | "city" | "ice" | "rc";
const SOCIALS = ["instagram", "facebook", "tiktok", "youtube", "snapchat"] as const;
/** The countries the legal pages know (ISO codes; the names come from Intl in the viewer's language). */
const COUNTRIES = ["MA", "DZ", "TN", "SN", "CI", "FR", "BE", "ES", "DE", "IT", "NL", "PT", "GB", "US", "AE", "SA"] as const;
/** A field's error key: the schema's sentence is English, so each field has its own catalog line. */
const FIELD_ERROR: Record<string, string> = {
  phone: "shell.contact.err.phone",
  whatsapp: "shell.contact.err.phone",
  email: "shell.contact.err.email",
  ice: "shell.contact.err.ice",
  rc: "shell.contact.err.rc",
};

function regionName(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The smallest WebP rendition ≥ 160 px wide, for the logo preview. */
function previewUrl(a: PickedAsset): string | null {
  const v = a.variants.filter((x) => x.fmt === "webp").sort((x, y) => x.w - y.w);
  const best = v.find((x) => x.w >= 160) ?? v[v.length - 1];
  return best ? `/media/${best.key}` : a.url;
}

export function ContactForm({
  initial,
  logoUrl,
  canWrite,
  canLogo,
  hoursHref,
  save,
}: {
  initial: StoreInput;
  logoUrl: string | null;
  canWrite: boolean;
  canLogo: boolean;
  hoursHref: string | null;
  save(input: StoreInput): Promise<ActionResult<null>>;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const actions = useActionError();
  const [values, setValues] = useState<StoreInput>(initial);
  const [saved, setSaved] = useState<StoreInput>(initial);
  const [logoPreview, setLogoPreview] = useState(logoUrl);
  const [picker, setPicker] = useState(false);
  const [pickerMounted, setPickerMounted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  const text = (key: TextKey) => ({
    value: values[key] ?? "",
    disabled: !canWrite,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      if (errors[key]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || busy || !dirty) return;
    const parsed = StoreSettings.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String);
        const field = path[0] === "socials" ? `socials.${path[1] ?? ""}` : (path[0] ?? "form");
        next[field] ??= path[0] === "socials" ? "shell.contact.err.url" : (FIELD_ERROR[field] ?? "error.invalid");
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await actions.run(() => save(values));
      if (res.ok) {
        setSaved(values);
        toast.success(t("shell.contact.saved"));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const labels: Record<string, string> = {
    phone: t("shell.contact.phone"),
    whatsapp: t("shell.contact.whatsapp"),
    email: t("shell.contact.email"),
    ice: "ICE",
    rc: "RC",
    ...Object.fromEntries(SOCIALS.map((s) => [`socials.${s}`, t(`shell.contact.social.${s}`)])),
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="contents">
        <SettingsCard
          id="contact"
          title={t("shell.contact.title")}
          description={t("shell.contact.lead")}
          footer={
            canWrite ? (
              <>
                {dirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setValues(saved);
                      setLogoPreview(logoUrl);
                      setErrors({});
                    }}
                    className="me-auto text-[13px] text-muted-foreground hover:text-foreground"
                  >
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

          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!canWrite || !canLogo}
              onClick={() => {
                setPickerMounted(true);
                setPicker(true);
              }}
              aria-label={t(values.logo ? "shell.contact.logo_change" : "shell.contact.logo_choose")}
              className={cn(
                "grid size-20 shrink-0 place-items-center overflow-hidden rounded-[var(--r-card)] bg-muted/60 ring-1 ring-border transition-[box-shadow] duration-[var(--dur-1)] ring-inset enabled:hover:ring-foreground/25 disabled:cursor-default",
                FOCUS_RING,
              )}
            >
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- an optimised media variant
                <img src={logoPreview} alt="" className="max-h-full max-w-full object-contain p-2" />
              ) : (
                <ImageIcon aria-hidden="true" className="size-6 text-muted-foreground" />
              )}
            </button>
            <div className="grid gap-1">
              <p className="text-[13px] font-medium">{t("shell.contact.logo")}</p>
              <p className="text-xs text-muted-foreground">{t(canLogo ? "shell.contact.logo_hint" : "shell.contact.logo_role")}</p>
              {values.logo && canWrite && canLogo && (
                <button
                  type="button"
                  onClick={() => {
                    setValues((v) => ({ ...v, logo: undefined }));
                    setLogoPreview(null);
                  }}
                  className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <XIcon aria-hidden="true" className="size-3" />
                  {t("shell.contact.logo_remove")}
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field label={labels.whatsapp} optional hint={t("shell.contact.whatsapp_hint")} error={errors.whatsapp}>
              {(p) => <Input {...p} {...text("whatsapp")} className={FIELD_INPUT} inputMode="tel" dir="ltr" autoComplete="tel" />}
            </Field>
            <Field label={labels.phone} optional error={errors.phone}>
              {(p) => <Input {...p} {...text("phone")} className={FIELD_INPUT} inputMode="tel" dir="ltr" autoComplete="tel" />}
            </Field>
            <Field label={labels.email} optional error={errors.email} className="sm:col-span-2">
              {(p) => <Input {...p} {...text("email")} className={FIELD_INPUT} type="email" dir="ltr" autoComplete="email" />}
            </Field>
            <Field label={t("shell.contact.address")} optional className="sm:col-span-2">
              {(p) => <Input {...p} {...text("address")} className={FIELD_INPUT} maxLength={300} autoComplete="street-address" />}
            </Field>
            <Field label={t("shell.contact.city")} optional>
              {(p) => <Input {...p} {...text("city")} className={FIELD_INPUT} maxLength={120} autoComplete="address-level2" />}
            </Field>
            <Field label={t("shell.contact.country")}>
              {(p) => (
                <NativeSelect {...p} value={values.country ?? "MA"} disabled={!canWrite} onChange={(e) => setValues((v) => ({ ...v, country: e.target.value }))}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {regionName(locale, c)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="ICE" optional hint={t("shell.contact.ice_hint")} error={errors.ice}>
              {(p) => <Input {...p} {...text("ice")} className={cn(FIELD_INPUT, "font-mono")} inputMode="numeric" dir="ltr" maxLength={15} />}
            </Field>
            <Field label="RC" optional hint={t("shell.contact.rc_hint")} error={errors.rc}>
              {(p) => <Input {...p} {...text("rc")} className={cn(FIELD_INPUT, "font-mono")} dir="ltr" maxLength={30} />}
            </Field>
          </div>

          <div className="grid gap-3 border-t border-border pt-5">
            <p className="text-[13px] font-medium">{t("shell.contact.socials")}</p>
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              {SOCIALS.map((s) => (
                <Field key={s} label={labels[`socials.${s}`]} optional error={errors[`socials.${s}`]}>
                  {(p) => (
                    <Input
                      {...p}
                      className={FIELD_INPUT}
                      type="url"
                      dir="ltr"
                      inputMode="url"
                      disabled={!canWrite}
                      value={values.socials?.[s] ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setValues((v) => ({
                          ...v,
                          socials: { ...(v.socials ?? {}), [s]: value },
                        }));
                      }}
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-[var(--r-control)] bg-muted/50 px-3.5 py-2.5 text-[13px] text-muted-foreground">
            <PhoneCallIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {hoursHref ? (
              <Link href={hoursHref} className={cn("underline-offset-4 hover:text-foreground hover:underline", FOCUS_RING)}>
                {t("shell.general.hours_link")}
              </Link>
            ) : (
              <span>{t("shell.general.hours_link")}</span>
            )}
          </p>
        </SettingsCard>
      </form>
      {/* outside the form: React events bubble through portals, so the picker's own buttons never reach this submit */}
      {canWrite && canLogo && pickerMounted && (
        <MediaPicker
          open={picker}
          onOpenChange={setPicker}
          accept="image"
          title={t("shell.contact.logo_choose")}
          onPick={(a) => {
            setValues((v) => ({
              ...v,
              logo: { id: a.id, alt: a.alt || v.storeName || "" },
            }));
            setLogoPreview(previewUrl(a));
          }}
        />
      )}
    </>
  );
}
