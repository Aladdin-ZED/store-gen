"use client";
/**
 * The legal re-acceptance sheet (P2 SHELL; platform.md PLA-§22.15, PD17): when a published platform document asks for
 * a new acceptance and the viewer has not given it (P1's `pendingReacceptance`, read by the `[store]` layout and
 * signalled by `pulse.reaccept`), this blocks the dashboard: focus trapped, no close button, Escape and outside clicks
 * ignored. Each document shows its title and "What changed"; **I accept** runs `acceptLegalAction` (the IP hash and the
 * device label are the server's), **Sign out** leaves. Never during "view as store" (the layout passes nothing then).
 *
 * The full text has no public page before P1's publisher, so the sheet links it only when P1 gives one (`href`).
 */
import { FileTextIcon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, use, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { acceptLegalAction } from "@/app/app/actions";
import { logout } from "@/lib/auth/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { LegalDocSummary } from "@/lib/platform/legal";
import { cn } from "@/lib/utils";
import { TOUCH } from "../common/ui-classes";
import { signOutCleanup } from "./client-state";
import { useStore } from "./store-context";
import { useActionError } from "./use-action-error";

export type LegalSheetDoc = LegalDocSummary & { href?: string | null };

function Sheet({ docs }: { docs: LegalSheetDoc[] }) {
  const t = useT();
  const router = useRouter();
  const actions = useActionError();
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (docs.length === 0 || done) return null;
  const titles = docs.map((d) => d.title).join(", ");
  const block = (e: Event) => e.preventDefault();
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={block}
        onPointerDownOutside={block}
        onInteractOutside={block}
        className="max-h-[calc(100svh-2rem)] gap-0 overflow-hidden rounded-[var(--r-sheet)] p-0 sm:max-w-[520px]"
      >
        <DialogHeader className="gap-2 border-b border-border p-6">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-[var(--r-control)] bg-muted text-muted-foreground">
            <FileTextIcon className="size-5" />
          </span>
          <DialogTitle className="text-base font-semibold tracking-[-0.006em]">{t("shell.legal.reaccept_title", { document: titles })}</DialogTitle>
          <DialogDescription className="leading-relaxed text-pretty">{t("shell.legal.lead")}</DialogDescription>
        </DialogHeader>
        <div className="adm-scroll grid max-h-[50svh] gap-4 overflow-y-auto p-6">
          {docs.map((d) => (
            <section key={d.id} className="grid gap-1.5">
              <h3 className="text-[13px] font-medium text-muted-foreground">
                {d.title} <span className="tabular-nums">v{d.version}</span>
              </h3>
              <p className="text-[11px] font-medium text-muted-foreground">{t("shell.legal.what_changed")}</p>
              <p className="text-sm leading-relaxed whitespace-pre-line text-pretty">{d.summary}</p>
              {d.href && (
                <a href={d.href} target="_blank" rel="noopener noreferrer" className="justify-self-start text-[13px] font-medium text-brand underline-offset-4 hover:underline">
                  {t("shell.legal.read_full")}
                </a>
              )}
            </section>
          ))}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
          <form action={logout} onSubmit={() => signOutCleanup(store.id, store.viewerId)}>
            <Button type="submit" variant="ghost" className={cn("w-full gap-2 sm:w-auto", TOUCH)}>
              <LogOutIcon aria-hidden="true" />
              {t("shell.legal.sign_out")}
            </Button>
          </form>
          <Button
            type="button"
            variant="brand"
            disabled={busy}
            aria-busy={busy || undefined}
            className={cn("w-full sm:w-auto", TOUCH)}
            onClick={async () => {
              setBusy(true);
              const res = await actions.run(() => acceptLegalAction({ documentIds: docs.map((d) => d.id) }));
              setBusy(false);
              if (res.ok) {
                setDone(true);
                router.refresh();
              }
            }}
          >
            {busy ? t("shell.legal.accepting") : t("shell.legal.accept")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Pending({ docs }: { docs: Promise<LegalSheetDoc[] | null> }) {
  const list = use(docs);
  return list ? <Sheet docs={list} /> : null;
}

/** The blocking sheet once the layout's read resolves (nothing while it loads, nothing when nothing is pending). */
export function LegalSheet({ docs }: { docs: Promise<LegalSheetDoc[] | null> | null }) {
  if (!docs) return null;
  return (
    <Suspense fallback={null}>
      <Pending docs={docs} />
    </Suspense>
  );
}
