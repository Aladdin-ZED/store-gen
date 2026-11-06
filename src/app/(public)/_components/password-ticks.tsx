"use client";
/**
 * The live password policy ticks (platform.md PLA-§22.1): the client-checkable rules of `passwordProblem()`
 * (src/lib/auth/password.ts) as ticks under the field. The common-password list stays on the server, which checks
 * every rule again on submit.
 */
import { CheckIcon } from "lucide-react";
import { useAuthT } from "@/lib/auth/i18n/client";
import { cn } from "@/lib/utils";

/** Mirrors `PASSWORD_MIN_LENGTH` and the email / repetition rules of `passwordProblem()`. Pure. */
export function passwordTicks(password: string, email: string): { length: boolean; email: boolean; varied: boolean } {
  const value = password.normalize("NFKC");
  const lower = value.toLowerCase();
  const mail = email.normalize("NFKC").trim().toLowerCase();
  const local = mail.split("@")[0] ?? "";
  const containsEmail = mail.includes("@") ? lower.includes(mail) || (local.length >= 4 && lower.includes(local)) : false;
  return { length: [...value].length >= 10, email: value.length > 0 && !containsEmail, varied: new Set(value).size >= 4 };
}

/** `email` null: the form doesn't know the account's address (reset), so that rule is left to the server. */
export function PasswordTicks({ password, email, className }: { password: string; email: string | null; className?: string }) {
  const t = useAuthT();
  const ticks = passwordTicks(password, email ?? "");
  const rows: { key: "auth.password.tick.length" | "auth.password.tick.varied" | "auth.password.tick.email"; ok: boolean }[] = [
    { key: "auth.password.tick.length", ok: ticks.length },
    { key: "auth.password.tick.varied", ok: ticks.varied },
  ];
  if (email !== null) rows.push({ key: "auth.password.tick.email", ok: ticks.email });
  return (
    <ul aria-label={t("auth.password.ticks")} className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {rows.map((r) => (
        <li key={r.key} data-ok={r.ok || undefined} className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-150 data-ok:text-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-3.5 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors duration-150",
              r.ok ? "bg-success text-white ring-success" : "ring-border",
            )}
          >
            {r.ok && <CheckIcon className="size-2.5" strokeWidth={3.5} />}
          </span>
          {t(r.key)}
        </li>
      ))}
    </ul>
  );
}
