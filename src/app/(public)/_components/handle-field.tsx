"use client";
/**
 * The store name and handle pair of /signup, /app/new and the first-run store (§C.7): the handle follows the name
 * until edited, and is checked live (`checkHandleAction`, 250 ms after the last keystroke). The server decides again
 * at insert; the live answer never says why a handle is taken.
 */
import { CheckIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthT } from "@/lib/auth/i18n/client";
import { checkHandleAction } from "../signup/actions";
import { TextField } from "./form-ui";

/** A handle suggestion from the store name: Latin letters and digits, hyphens between words. Pure. */
export function suggestHandle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

type HandleState = { kind: "idle" } | { kind: "checking" } | { kind: "free" } | { kind: "taken"; key: string };

function useHandleCheck(handle: string): HandleState {
  const [state, setState] = useState<HandleState>({ kind: "idle" });
  const [prev, setPrev] = useState<string | null>(null);
  if (handle !== prev) {
    setPrev(handle);
    setState(handle ? (HANDLE_RE.test(handle) ? { kind: "checking" } : { kind: "taken", key: "auth.signup.handle_format" }) : { kind: "idle" });
  }
  useEffect(() => {
    if (!HANDLE_RE.test(handle)) return;
    let live = true;
    const timer = setTimeout(() => {
      void checkHandleAction(handle)
        .then((r) => {
          // a refusal of the seam (the burst floor, the origin) says nothing about the handle: back to idle
          if (live) setState(!r.ok || r.data.limited ? { kind: "idle" } : r.data.problem ? { kind: "taken", key: r.data.problem } : { kind: "free" });
        })
        .catch(() => {
          if (live) setState({ kind: "idle" });
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [handle]);
  return state;
}

/**
 * Both fields; the handle posts as `handle`, the name as `storeName`. `collapsible` (/signup): the handle shows as the
 * address line under the name, with its availability and a Change button that opens the field; an error opens it.
 */
export function StoreNameAndHandle({
  initialName,
  initialHandle,
  errors,
  addressTemplate,
  collapsible = false,
}: {
  initialName: string;
  initialHandle: string;
  errors: { storeName?: string; handle?: string };
  /** the store's future address with `__HANDLE__` in place of the handle: previewed under the field */
  addressTemplate?: string;
  collapsible?: boolean;
}) {
  const t = useAuthT();
  const [storeName, setStoreName] = useState(initialName);
  const [handle, setHandle] = useState(initialHandle);
  const [edited, setEdited] = useState(initialHandle !== "");
  const shown = edited ? handle : suggestHandle(storeName);
  const check = useHandleCheck(shown);
  const live = check.kind === "taken" ? t(check.key) : undefined;
  const serverError = errors.handle && shown === initialHandle ? t(errors.handle) : undefined;
  const [open, setOpen] = useState(!collapsible);
  // a refused or unavailable handle opens the field, so the fix is one tap away
  if (!open && (serverError || live)) setOpen(true);

  const address = addressTemplate ? addressTemplate.replace(/^https?:\/\//, "").replace(/\/$/, "").split("__HANDLE__") : null;
  const status =
    check.kind === "checking" ? (
      <span className="inline-flex items-center gap-1.5">
        <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
        {t("auth.signup.handle_checking")}
      </span>
    ) : check.kind === "free" ? (
      <span className="inline-flex items-center gap-1.5 text-success-ink dark:text-success">
        <CheckIcon aria-hidden="true" className="size-3" />
        {t("auth.signup.handle_free")}
      </span>
    ) : null;

  return (
    <>
      <TextField label={t("auth.field.store_name")} name="storeName" maxLength={120} required value={storeName} onChange={(e) => setStoreName(e.target.value)} error={errors.storeName ? t(errors.storeName) : undefined} />
      <input type="hidden" name="handle" value={shown} />
      {open && (
        <TextField
          label={t("auth.field.handle")}
          name="handle-visible"
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          value={shown}
          autoFocus={collapsible}
          onChange={(e) => {
            setEdited(true);
            setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
          }}
          error={serverError ?? live}
          hint={status ?? (address ? undefined : t("auth.signup.handle_hint"))}
        />
      )}
      {address && (
        <div className="-mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          <span className="shrink-0">{t("app.new.address_preview")}</span>
          <bdi dir="ltr" className="min-w-0 truncate font-mono">
            {address[0]}
            <span className="text-foreground">{shown || "…"}</span>
            {address[1]}
          </bdi>
          {!open && status && <span className="shrink-0">{status}</span>}
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="-my-3 ms-auto inline-flex min-h-11 shrink-0 items-center rounded-sm px-1 font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("auth.signup.handle_edit")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
