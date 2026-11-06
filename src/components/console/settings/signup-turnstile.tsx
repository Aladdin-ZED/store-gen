"use client";
/**
 * Sign-up → Turnstile (platform.md PLA-§13.2, PD68, CRIT2-13): the platform widget's site key (public by design), the
 * secret as "set / not set" with Replace (a fresh step-up; the secret is never displayed or answered), the hostnames
 * note, the gate rule in one line, and Test: a token from the embedded widget verified against the stored secret.
 */
import { useState, type FormEvent } from "react";
import { saveTurnstileAction, testTurnstileAction } from "@/app/admin/(console)/settings/actions";
import { TurnstileField } from "@/app/(public)/_components/turnstile-field";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { useGuarded } from "../guarded";
import { Banner, button, Field, inputCls, SaveBar, SettingsCard, StatusText, useSave } from "../kit";

export function TurnstileTab({ siteKey, secret, nonce }: { siteKey: string | null; secret: "set" | "not_set"; nonce?: string }) {
  const t = useT();
  const save = useSave();
  const [key, setKey] = useState(siteKey ?? "");
  const [replace, setReplace] = useState(secret === "not_set");
  const [secretKey, setSecretKey] = useState("");
  const keyOk = /^[A-Za-z0-9_-]{10,100}$/.test(key.trim());
  const dirty = key.trim() !== (siteKey ?? "") || secretKey.trim() !== "";
  return (
    <div className="grid gap-4">
      <Banner tone="info">{t("console.turnstile.rule")}</Banner>
      <SettingsCard
        title={t("console.turnstile.title")}
        lead={t("console.turnstile.lead")}
        aside={secret === "set" && siteKey ? <StatusText tone="ok">{t("console.turnstile.configured")}</StatusText> : <StatusText tone="warn">{t("console.turnstile.not_configured")}</StatusText>}
        footer={
          <SaveBar
            save={save}
            dirty={dirty}
            disabled={!keyOk || (secret === "not_set" && !secretKey.trim())}
            label={t("console.turnstile.save")}
            onSave={() => save.save((opId) => saveTurnstileAction({ siteKey: key.trim(), secretKey: secretKey.trim() || undefined, opId }), t("console.settings.saved"), () => (setSecretKey(""), setReplace(false)))}
          />
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("console.turnstile.site_key")} hint={t("console.turnstile.site_key_hint")} problem={key && !keyOk ? t("console.turnstile.invalid") : null}>
            {(id, d) => <input id={id} aria-describedby={d} dir="ltr" spellCheck={false} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className={cn(inputCls, "font-mono")} />}
          </Field>
          <Field label={t("console.turnstile.secret")} hint={t("console.turnstile.secret_hint")}>
            {(id, d) =>
              replace ? (
                <input id={id} aria-describedby={d} type="password" dir="ltr" autoComplete="new-password" spellCheck={false} placeholder={t("console.turnstile.secret_placeholder")} value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className={cn(inputCls, "font-mono")} />
              ) : (
                <div className="flex items-center gap-2">
                  <span id={id} aria-describedby={d} className="inline-flex h-[var(--ctl)] flex-1 items-center rounded-[var(--r-control)] bg-muted/50 px-3 text-[12.5px] max-md:h-11">
                    {t(`console.turnstile.secret_${secret}`)}
                  </span>
                  <button type="button" onClick={() => setReplace(true)} className={cn(button.base, button.secondary)}>
                    {t("console.turnstile.replace")}
                  </button>
                </div>
              )
            }
          </Field>
        </div>
        <p className="text-[12.5px] text-muted-foreground">{t("console.turnstile.hostnames")}</p>
      </SettingsCard>
      {secret === "set" && siteKey && <TestCard siteKey={siteKey} nonce={nonce} />}
    </div>
  );
}

function TestCard({ siteKey, nonce }: { siteKey: string; nonce?: string }) {
  const t = useT();
  const g = useGuarded();
  const [result, setResult] = useState<"ok" | "failed" | "unverified" | "not_set" | null>(null);
  const [round, setRound] = useState(0);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const token = String(new FormData(e.currentTarget).get("cf-turnstile-response") ?? "");
    if (!token) {
      g.setProblem(t("console.turnstile.no_token"));
      return;
    }
    void g.run(() => testTurnstileAction({ token }), (d) => (setResult(d.result), setRound((n) => n + 1)));
  };
  return (
    <SettingsCard title={t("console.turnstile.test")} lead={t("console.turnstile.test_lead")}>
      <form onSubmit={submit} className="grid gap-3">
        <TurnstileField siteKey={siteKey} nonce={nonce} locale="en" resetKey={round || undefined} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={g.busy} className={cn(button.base, button.secondary)}>
            {t("console.turnstile.verify")}
          </button>
          {result && <StatusText tone={result === "ok" ? "ok" : result === "unverified" ? "warn" : "danger"}>{t(`console.turnstile.result.${result}`)}</StatusText>}
          {g.problem && <span className="text-[12px] text-[var(--c-danger-ink)]">{g.problem}</span>}
        </div>
      </form>
      {g.sheet}
    </SettingsCard>
  );
}
