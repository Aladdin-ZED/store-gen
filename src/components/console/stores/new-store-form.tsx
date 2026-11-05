"use client";
/**
 * Console store creation (platform.md PLA-§6.2, §13.3; core §A.5.1 "console create internal store"; PD70): name,
 * handle with its live availability (format, reserved, taken; a protected term is allowed with a note, staff may
 * override it), mode (landing, store or both: internal stores may preview the R2 modes), market, currency and time
 * zone from the platform defaults, plan (default `internal`) and the owner by exact e-mail (empty: the staff member).
 * One operation id per form; the new store's profile opens on success. Labels above fields, hints below.
 *
 *   <NewStoreForm defaults={{ market: "MA", currency: "MAD", timezone: "Africa/Casablanca" }} plans={…} staffEmail="…" />
 */
import { CheckIcon, CircleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { checkStoreHandleAction, createStoreAction } from "@/app/admin/(console)/stores/new/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { newOpId } from "../op";
import { button, NoteField } from "../queue/decision-dialogs";

type Mode = "landing" | "store" | "both";
type HandleState = "idle" | "checking" | "ok" | "format" | "reserved" | "taken" | "protected" | "error";

const ZONES = ["Africa/Casablanca", "Europe/Paris", "Europe/Brussels", "Europe/Madrid", "Europe/Berlin", "Europe/Rome", "Europe/Amsterdam", "Europe/Lisbon", "UTC"];

/** The handle a name suggests: lower case, every other run of characters a hyphen, 30 characters at most. */
export function handleFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)
    .replace(/^-+|-+$/g, "");
}

const input =
  "h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-[var(--dur-1)] focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11";

function Field({ id, label, optional, hint, problem, children }: { id: string; label: string; optional?: boolean; hint?: ReactNode; problem?: string | null; children: ReactNode }) {
  const t = useT();
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-medium">
        {label}
        {optional && <span className="ms-1.5 font-normal text-muted-foreground">{t("console.form.optional")}</span>}
      </label>
      {children}
      {(problem || hint) && (
        <p id={`${id}-d`} className={cn("text-[12px]", problem ? "text-[var(--c-danger-ink)]" : "text-muted-foreground")}>
          {problem ?? hint}
        </p>
      )}
    </div>
  );
}

export function NewStoreForm({
  defaults,
  plans,
  markets,
  currencyOf,
  staffEmail,
}: {
  defaults: { market: string; currency: string; timezone: string };
  plans: { id: string; name: string }[];
  markets: readonly string[];
  /** each market's own currency (switching the market proposes it) */
  currencyOf: Record<string, string>;
  staffEmail: string;
}) {
  const t = useT();
  const router = useRouter();
  const ids = { name: useId(), handle: useId(), market: useId(), currency: useId(), tz: useId(), plan: useId(), owner: useId() };
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [mode, setMode] = useState<Mode>("landing");
  const [market, setMarket] = useState(defaults.market);
  const [currency, setCurrency] = useState(defaults.currency);
  const [timezone, setTimezone] = useState(defaults.timezone);
  const [plan, setPlan] = useState(plans.some((p) => p.id === "internal") ? "internal" : (plans[0]?.id ?? "internal"));
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState<{ handle: string; state: HandleState } | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const op = useRef(newOpId());
  const seq = useRef(0);

  // the live availability, 300 ms after the last keystroke; a stale answer never overwrites a newer one, and the
  // field reads "Checking" until the answer for what is typed now arrives
  const typed = handle.trim();
  const hs: HandleState = !typed ? "idle" : checked?.handle === typed ? checked.state : "checking";
  useEffect(() => {
    if (!typed) return;
    const mine = ++seq.current;
    const id = setTimeout(async () => {
      const r = await checkStoreHandleAction({ handle: typed }).catch(() => null);
      if (mine !== seq.current) return;
      setChecked({ handle: typed, state: r && r.ok ? r.data.state : "error" });
    }, 300);
    return () => clearTimeout(id);
  }, [typed]);

  const handleLine: Record<HandleState, { text: string; tone: "ok" | "bad" | "warn" | "muted" } | null> = {
    idle: { text: t("console.store_new.handle_hint"), tone: "muted" },
    checking: { text: t("console.store_new.handle_checking"), tone: "muted" },
    ok: { text: t("console.store_new.handle_ok"), tone: "ok" },
    format: { text: t("auth.signup.handle_format"), tone: "bad" },
    reserved: { text: t("console.store_new.handle_reserved"), tone: "bad" },
    taken: { text: t("auth.signup.handle_unavailable"), tone: "bad" },
    protected: { text: t("console.store_new.handle_protected"), tone: "warn" },
    error: { text: t("console.store_new.handle_error"), tone: "muted" },
  };
  const line = problems.handle ? { text: problems.handle, tone: "bad" as const } : handleLine[hs];
  const noteNeeded = hs === "protected" || !!problems.note;

  const submit = () => {
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = t("console.store_new.name_required");
    if (!handle.trim()) local.handle = t("console.store_new.handle_required");
    else if (hs === "format" || hs === "reserved" || hs === "taken") local.handle = handleLine[hs]!.text;
    if (hs === "protected" && !note.trim()) local.note = t("console.store_new.brand_note_required");
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) local.currency = t("console.store_new.currency_invalid");
    setProblems(local);
    if (Object.keys(local).length) return;
    start(async () => {
      const r = await createStoreAction({
        name: name.trim(),
        handle: handle.trim(),
        mode,
        market: market as never,
        currency: currency.trim().toUpperCase(),
        timezone: timezone.trim(),
        plan,
        ...(owner.trim() ? { ownerEmail: owner.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        opId: op.current,
      });
      if (r.ok) {
        toast.success(t("console.store_new.created", { handle: r.data.handle }));
        router.push(`/admin/stores/${r.data.storeId}`);
        return;
      }
      if (r.items?.length) {
        const fields: Record<string, string> = {};
        for (const item of r.items) if (item.field) fields[item.field === "ownerEmail" ? "owner" : item.field] = t(item.title as MessageKey);
        setProblems(fields);
      }
      // a refused first run gives its operation id back; a new id keeps a retry a first run either way
      op.current = newOpId();
      toast.error(r.message ? t(r.message) : t("console.store_new.failed"));
    });
  };

  const Tone = line?.tone === "ok" ? CheckIcon : line?.tone === "bad" || line?.tone === "warn" ? CircleAlertIcon : null;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-5 rounded-[var(--r-card)] bg-card p-5 shadow-[inset_0_0_0_1px_var(--c-hairline)] md:p-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={ids.name} label={t("console.store_new.name")} problem={problems.name}>
          <input
            id={ids.name}
            value={name}
            autoFocus
            maxLength={80}
            aria-invalid={!!problems.name || undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (!handleTouched) setHandle(handleFromName(e.target.value));
            }}
            className={input}
          />
        </Field>
        <div className="grid content-start gap-1.5">
          <label htmlFor={ids.handle} className="text-[12.5px] font-medium">
            {t("console.store_new.handle")}
          </label>
          <div className="flex h-[var(--ctl)] items-center rounded-[var(--r-control)] bg-background shadow-[inset_0_0_0_1px_var(--input)] focus-within:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] max-md:h-11" dir="ltr">
            <span className="ps-3 font-mono text-[12.5px] text-muted-foreground">@</span>
            <input
              id={ids.handle}
              value={handle}
              spellCheck={false}
              autoComplete="off"
              maxLength={30}
              aria-invalid={line?.tone === "bad" || undefined}
              aria-describedby={`${ids.handle}-d`}
              onChange={(e) => {
                setHandleTouched(true);
                setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              className="h-full min-w-0 flex-1 bg-transparent ps-0.5 pe-3 font-mono text-[13px] outline-none"
            />
          </div>
          {line && (
            <p
              id={`${ids.handle}-d`}
              aria-live="polite"
              className={cn(
                "flex items-center gap-1.5 text-[12px]",
                line.tone === "ok" && "text-[oklch(0.42_0.1_160)] dark:text-[oklch(0.82_0.1_160)]",
                line.tone === "bad" && "text-[var(--c-danger-ink)]",
                line.tone === "warn" && "text-[oklch(0.45_0.09_95)] dark:text-[oklch(0.86_0.11_95)]",
                line.tone === "muted" && "text-muted-foreground",
              )}
            >
              {Tone && <Tone aria-hidden="true" className="size-3.5 shrink-0" />}
              {line.text}
            </p>
          )}
        </div>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.store_new.mode")}</legend>
        <div role="radiogroup" className="grid gap-1.5 sm:grid-cols-3">
          {(["landing", "store", "both"] as const).map((m) => (
            <label
              key={m}
              className={cn(
                "grid cursor-pointer gap-0.5 rounded-[var(--r-control)] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-[var(--dur-1)] hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]",
                mode === m && "bg-[var(--brand-soft)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_45%,transparent)]",
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium">
                <input type="radio" name="store-mode" checked={mode === m} onChange={() => setMode(m)} className="size-3.5 accent-[var(--brand)]" />
                {t(`console.mode.${m}`)}
              </span>
              <span className="ps-[22px] text-[12px] text-muted-foreground">{t(`console.store_new.mode_hint.${m}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={ids.market} label={t("console.store_new.market")}>
          <select
            id={ids.market}
            value={market}
            onChange={(e) => {
              setMarket(e.target.value);
              const c = currencyOf[e.target.value];
              if (c) setCurrency(c);
            }}
            className={cn(input, "font-mono")}
          >
            {markets.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field id={ids.currency} label={t("console.store_new.currency")} problem={problems.currency}>
          <input id={ids.currency} value={currency} maxLength={3} dir="ltr" onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} aria-invalid={!!problems.currency || undefined} className={cn(input, "font-mono uppercase")} />
        </Field>
        <Field id={ids.tz} label={t("console.store_new.timezone")} problem={problems.timezone}>
          <input id={ids.tz} value={timezone} list={`${ids.tz}-l`} dir="ltr" spellCheck={false} onChange={(e) => setTimezone(e.target.value)} aria-invalid={!!problems.timezone || undefined} className={cn(input, "font-mono text-[12.5px]")} />
          <datalist id={`${ids.tz}-l`}>
            {ZONES.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field id={ids.plan} label={t("console.store_new.plan")} hint={t("console.store_new.plan_hint")} problem={problems.plan}>
          <select id={ids.plan} value={plan} onChange={(e) => setPlan(e.target.value)} className={input}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={ids.owner} label={t("console.store_new.owner")} optional hint={t("console.store_new.owner_hint", { email: staffEmail })} problem={problems.owner}>
          <input id={ids.owner} type="email" dir="ltr" autoComplete="off" spellCheck={false} value={owner} onChange={(e) => setOwner(e.target.value)} aria-invalid={!!problems.owner || undefined} className={input} />
        </Field>
      </div>

      <NoteField
        label={t("console.store_new.note")}
        hint={t(noteNeeded ? "console.store_new.note_hint_brand" : "console.store_new.note_hint")}
        value={note}
        onChange={setNote}
        required={noteNeeded}
        problem={problems.note ?? null}
        rows={2}
      />

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-hairline)] pt-4">
        <button type="button" onClick={() => router.push("/admin/stores")} className={cn(button.base, button.ghost)}>
          {t("console.dialog.cancel")}
        </button>
        <button type="submit" disabled={pending} className={cn(button.base, button.primary)}>
          {pending ? t("console.store_new.creating") : t("console.store_new.create")}
        </button>
      </div>
    </form>
  );
}
