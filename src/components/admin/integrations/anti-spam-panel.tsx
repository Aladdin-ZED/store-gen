"use client";
/**
 * Settings → Anti-spam (operations.md OPE-§24, IN-06; core §D.10, §I.8): "Bot protection: on (platform)" with the
 * share of the last 24 hours' orders Turnstile verified and its n (withheld below 20 orders), the store's own optional
 * Turnstile keys (needed for a custom domain, R3; the secret write-only: set / not set, never echoed), the honeypot
 * and "orders from exports without the check are marked To check" explanations, and the links to the blocklist and
 * the orders marked To check.
 *
 * Edits go through `saveTurnstileOverrideAction` (settings.write + integrations.manage); everyone else, "view as
 * store" and a pending store read the page with the one-line reason.
 */
import { ArrowUpRightIcon, BanIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon, ShieldCheckIcon, Trash2Icon, UnplugIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveTurnstileOverrideAction, type TurnstileOverrideView } from "@/app/app/[store]/settings/anti-spam/actions";
import { Button } from "@/components/ui/button";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { ProtectionSource, TurnstileShare } from "@/lib/integrations/turnstile-stats";
import { cn } from "@/lib/utils";
import { Field, SecretInput, TextInput } from "../settings/form-kit";
import { useStore } from "../shell/store-context";
import { useStoreStepUp } from "../shell/step-up";
import { intlLocale, num } from "./hub-format";
import { InlineError } from "./hub-states";
import { IntConfirm } from "./int-confirm";
import { StateBadge } from "./state-badge";

export interface AntiSpamView {
  source: ProtectionSource | "error";
  share: TurnstileShare | "error";
  keys: TurnstileOverrideView | "error";
  /** UNPROTECTED_MIN_SCORE (src/lib/orders/risk.ts) */
  unprotectedScore: number;
}

const SOURCE_TONE = { platform: "success", store: "success", off: "neutral" } as const;

export function AntiSpamPanel({ view, canWrite, readOnlyReason }: { view: AntiSpamView; canWrite: boolean; readOnlyReason: string | null }) {
  const t = useT();
  const store = useStore();
  return (
    <div className="grid gap-5">
      <ProtectionCard source={view.source} share={view.share} />
      <KeysCard initial={view.keys} canWrite={canWrite} readOnlyReason={readOnlyReason} />

      <section aria-labelledby="as-always" className="adm-surface grid gap-4 p-4 sm:p-6">
        <h2 id="as-always" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
          {t("int.as.always.title")}
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {(
            [
              [EyeOffIcon, "honeypot", {}],
              [UnplugIcon, "exports", { score: view.unprotectedScore }],
            ] as const
          ).map(([Icon, k, params]) => (
            <li key={k} className="flex gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] text-foreground/70">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="grid min-w-0 gap-1">
                <span className="text-sm font-medium">{t(`int.as.${k}.title`)}</span>
                <span className="text-xs leading-relaxed text-pretty text-muted-foreground">{t(`int.as.${k}.body`, params)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border/60 pt-4">
          <Link href={store.href("/orders?tab=blocked")} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-foreground/85 underline-offset-4 hover:underline sm:min-h-0">
            <BanIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {t("int.as.links.blocklist")}
            <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
          <Link href={store.href("/orders?risky=1")} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-foreground/85 underline-offset-4 hover:underline sm:min-h-0">
            <ShieldCheckIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {t("int.as.links.risk")}
            <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function ProtectionCard({ source, share }: { source: AntiSpamView["source"]; share: AntiSpamView["share"] }) {
  const t = useT();
  const locale = useAdminLocale();
  const pct = (x: number) => new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(x);
  return (
    <section aria-labelledby="as-protection" className="adm-surface grid gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 max-w-[64ch] gap-1">
          <h2 id="as-protection" className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
            <ShieldCheckIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("int.as.protection.title")}
          </h2>
          {source !== "error" && <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t(`int.as.protection.body.${source}`)}</p>}
        </div>
        {source !== "error" && <StateBadge tone={SOURCE_TONE[source]}>{t(`int.as.protection.${source}`)}</StateBadge>}
      </header>
      {source === "error" && <InlineError />}

      <div className="grid gap-1.5 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset">
        <p className="text-xs font-medium text-muted-foreground">{t("int.as.share.label")}</p>
        {share === "error" ? (
          <p className="text-sm text-muted-foreground">{t("int.hub.loadError")}</p>
        ) : share.share === null ? (
          <>
            <p className="text-base font-semibold tracking-[-0.01em]">{t("int.as.share.needs", { min: share.minN })}</p>
            <p className="text-xs text-muted-foreground">{t("int.as.share.soFar", { n: share.n })}</p>
          </>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={cn("text-2xl font-semibold tracking-[-0.02em] tabular-nums", share.failing && "text-destructive")}>{pct(share.share)}</span>
              <span className="text-sm text-muted-foreground">{t("int.as.share.of", { verified: num(share.verified, locale), n: num(share.n, locale) })}</span>
            </p>
            {share.failing && <p className="text-xs text-pretty text-destructive">{t("int.as.share.failing")}</p>}
          </>
        )}
      </div>
    </section>
  );
}

/** A refusal of either answer shape (the action itself, or the step-up wrapper). */
type Refusal = { ok: false; error: string; message?: string };

function KeysCard({ initial, canWrite, readOnlyReason }: { initial: AntiSpamView["keys"]; canWrite: boolean; readOnlyReason: string | null }) {
  const t = useT();
  const router = useRouter();
  const stepUp = useStoreStepUp();
  const [keys, setKeys] = useState(initial);
  const [siteKey, setSiteKey] = useState(initial === "error" ? "" : (initial.siteKey ?? ""));
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const words = (res: Refusal) => (res.error === "step_up" ? t("int.sheets.stepUpNeeded") : t(res.message ?? `error.${res.error}`));
  const set = keys !== "error" && !!keys.siteKey && keys.secretSet;
  const dirty = keys !== "error" && (siteKey.trim() !== (keys.siteKey ?? "") || secret.trim() !== "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await stepUp.action(() => saveTurnstileOverrideAction({ siteKey: siteKey.trim(), secretKey: secret }));
      if (!res.ok) return setError(words(res));
      setKeys(res.data);
      setSiteKey(res.data.siteKey ?? "");
      setSecret("");
      toast.success(t("int.as.keys.saved"));
      router.refresh();
    } catch {
      setError(t("int.sheets.network"));
    } finally {
      setSaving(false);
    }
  }

  async function clear(): Promise<boolean> {
    try {
      const res = await stepUp.action(() => saveTurnstileOverrideAction({ clear: true }));
      if (!res.ok) {
        toast.error(words(res));
        return false;
      }
      setKeys(res.data);
      setSiteKey("");
      setSecret("");
      toast.success(t("int.as.keys.cleared"));
      router.refresh();
      return true;
    } catch {
      toast.error(t("int.sheets.network"));
      return false;
    }
  }

  return (
    <section aria-labelledby="as-keys" className="adm-surface grid gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 max-w-[64ch] gap-1">
          <h2 id="as-keys" className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
            <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("int.as.keys.title")}
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.as.keys.lead")}</p>
        </div>
        {keys !== "error" && <StateBadge tone={set ? "success" : "neutral"}>{t(set ? "int.as.keys.set" : "int.as.keys.notSet")}</StateBadge>}
      </header>

      {keys === "error" ? (
        <InlineError />
      ) : (
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("int.as.keys.site")} hint={t("int.as.keys.siteHint")}>
              {(p) => <TextInput {...p} value={siteKey} onChange={(e) => setSiteKey(e.target.value)} disabled={!canWrite || saving} spellCheck={false} autoComplete="off" dir="ltr" className="font-mono text-[0.82rem]" />}
            </Field>
            <Field label={t("int.as.keys.secret")} hint={keys.secretSet ? t("int.as.keys.secretSet") : t("int.as.keys.secretHint")}>
              {(p) => <SecretInput {...p} value={secret} onChange={setSecret} disabled={!canWrite || saving} placeholder={keys.secretSet ? t("int.as.keys.secretKeep") : ""} />}
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
              <Button type="submit" variant="brand" className="h-11 px-4 sm:h-8" disabled={saving || !dirty}>
                {saving && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                {t("int.as.keys.save")}
              </Button>
              {set && (
                <Button type="button" variant="ghost" className="h-11 px-3 text-destructive hover:text-destructive sm:h-8" disabled={saving} onClick={() => setConfirmClear(true)}>
                  <Trash2Icon aria-hidden="true" />
                  {t("int.as.keys.clear")}
                </Button>
              )}
            </div>
          ) : (
            readOnlyReason && <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">{readOnlyReason}</p>
          )}
        </form>
      )}

      <IntConfirm
        open={confirmClear}
        onOpenChange={setConfirmClear}
        icon={<Trash2Icon className="size-4" aria-hidden="true" />}
        title={t("int.as.keys.clear.title")}
        body={t("int.as.keys.clear.body")}
        confirmLabel={t("int.as.keys.clear")}
        destructive
        onConfirm={clear}
      />
    </section>
  );
}
