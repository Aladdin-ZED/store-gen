"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthT } from "@/lib/auth/i18n/client";
import type { Profile } from "@/lib/auth/profile";
import { Section } from "@/app/(public)/_components/kit";
import { useRunAction } from "@/app/(public)/_components/run-action";
import { TextField } from "@/app/(public)/_components/form-ui";
import { updateProfileAction } from "./actions";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "ar", label: "العربية" },
] as const;

export function ProfileForm({ profile }: { profile: Profile & { locale: "ar" | "fr" | "en" } }) {
  const t = useAuthT();
  const run = useRunAction();
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [locale, setLocale] = useState(profile.locale);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = name !== profile.name || phone !== (profile.phone ?? "") || locale !== profile.locale;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await run(updateProfileAction({ name, phone: phone || undefined, locale }), { success: "account.profile.saved", quiet: ["invalid"] });
      if (res.ok) {
        setErrors({});
        router.refresh();
      } else if (res.error === "invalid") {
        setErrors(Object.fromEntries((res.items ?? []).flatMap((i) => (i.field ? [[i.field, i.title]] : []))));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <Section title={t("account.profile.section")} description={t("account.profile.section_lead")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("auth.field.name")} name="name" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} error={errors.name ? t(errors.name) : undefined} />
          <div className="grid gap-2">
            <Label htmlFor="profile-email">{t("auth.field.email")}</Label>
            <Input id="profile-email" value={profile.email} readOnly disabled dir="ltr" className="h-10 bg-muted/50 px-3 text-[0.9rem]" />
            <p className="text-xs text-muted-foreground">{t("account.profile.email_fixed")}</p>
          </div>
          <TextField
            label={t("auth.field.phone")}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            maxLength={32}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            hint={t("auth.field.phone_hint")}
            error={errors.phone ? t(errors.phone) : undefined}
          />
          <fieldset className="grid content-start gap-2">
            <legend className="mb-2 text-sm font-medium">{t("account.profile.language")}</legend>
            <div role="radiogroup" className="inline-flex w-fit rounded-[8px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] p-0.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  lang={l.value}
                  aria-checked={locale === l.value}
                  onClick={() => setLocale(l.value)}
                  className={
                    locale === l.value
                      ? "h-8 rounded-[6px] bg-foreground/[0.07] px-3 text-sm font-medium"
                      : "h-8 rounded-[6px] px-3 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("account.profile.language_hint")}</p>
          </fieldset>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="brand" disabled={!dirty || saving}>
            {saving && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {t("account.save")}
          </Button>
        </div>
      </Section>
    </form>
  );
}
