"use client";
/**
 * The store name and handle pair of /signup, /app/new and the first-run store (§C.7): the handle follows the name
 * until edited, and is checked live (`checkHandleAction`, 350 ms after the last keystroke). The server decides again
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
          if (live) setState(r.limited ? { kind: "idle" } : r.problem ? { kind: "taken", key: r.problem } : { kind: "free" });
        })
        .catch(() => {
          if (live) setState({ kind: "idle" });
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [handle]);
  return state;
}

/** Both fields; the handle posts as `handle`, the name as `storeName`. */
export function StoreNameAndHandle({ initialName, initialHandle, errors }: { initialName: string; initialHandle: string; errors: { storeName?: string; handle?: string } }) {
  const t = useAuthT();
  const [storeName, setStoreName] = useState(initialName);
  const [handle, setHandle] = useState(initialHandle);
  const [edited, setEdited] = useState(initialHandle !== "");
  const shown = edited ? handle : suggestHandle(storeName);
  const check = useHandleCheck(shown);
  const live = check.kind === "taken" ? t(check.key) : undefined;

  return (
    <>
      <TextField label={t("auth.field.store_name")} name="storeName" maxLength={120} required value={storeName} onChange={(e) => setStoreName(e.target.value)} error={errors.storeName ? t(errors.storeName) : undefined} />
      <input type="hidden" name="handle" value={shown} />
      <TextField
        label={t("auth.field.handle")}
        name="handle-visible"
        dir="ltr"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={30}
        value={shown}
        onChange={(e) => {
          setEdited(true);
          setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
        }}
        error={errors.handle && shown === initialHandle ? t(errors.handle) : live}
        hint={
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
          ) : (
            t("auth.signup.handle_hint")
          )
        }
      />
    </>
  );
}
