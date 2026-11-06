"use client";
/**
 * The pages strip's Preview (platform.md PLA-§7.3 row 3, §7.5; PD16): a 10-minute staff link minted on demand
 * (`pagePreviewAction`), opened in a sheet as a 9:16 frame. The iframe is sandboxed `allow-scripts` only, never
 * `allow-same-origin`: tenant HTML never runs with the console's origin. The link expires on its own.
 *
 *   <PagePreviewButton storeId={id} pageId={page.id} name={page.name} />
 */
import { MonitorIcon, SmartphoneIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import { pagePreviewAction } from "@/app/admin/(console)/stores/[id]/actions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { Until } from "../../ago";
import { button, ConsoleDialog } from "../../queue/decision-dialogs";

export function PagePreviewButton({ storeId, pageId, name }: { storeId: string; pageId: string; name: string }) {
  const t = useT();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [wide, setWide] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setProblem(null);
    const r = await pagePreviewAction({ storeId, pageId }).catch(() => null);
    setBusy(false);
    if (r?.ok) setLink(r.data);
    else setProblem(t("console.strip.pages.preview_failed"));
  };

  return (
    <>
      <button type="button" onClick={open} disabled={busy} className={cn(button.base, button.secondary, "h-7 px-2.5 text-[12px]")}>
        {busy ? t("console.strip.pages.preview_opening") : t("console.strip.pages.preview")}
      </button>
      {problem && (
        <span role="alert" className="text-[12px] text-[var(--c-danger-ink)]">
          {problem}
        </span>
      )}
      {link && (
        <ConsoleDialog
          open
          onOpenChange={(o) => !o && setLink(null)}
          title={t("console.strip.pages.preview_title", { page: name })}
          description={<Until iso={link.expiresAt} template="console.strip.pages.preview_expires" />}
          footer={
            <>
              <div role="radiogroup" aria-label={t("console.strip.pages.preview_size")} className="me-auto inline-flex rounded-[var(--r-control)] bg-secondary p-0.5">
                {[false, true].map((w) => (
                  <button
                    key={String(w)}
                    type="button"
                    role="radio"
                    aria-checked={wide === w}
                    aria-label={t(w ? "console.strip.pages.desktop" : "console.strip.pages.phone")}
                    onClick={() => setWide(w)}
                    className={cn("inline-grid h-7 w-8 place-items-center rounded-[calc(var(--r-control)-2px)] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]", wide === w && "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--c-hairline)]")}
                  >
                    {w ? <MonitorIcon aria-hidden="true" className="size-3.5" /> : <SmartphoneIcon aria-hidden="true" className="size-3.5" />}
                  </button>
                ))}
              </div>
              <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.close")}</DialogPrimitive.Close>
            </>
          }
        >
          <div className="grid place-items-center">
            <iframe
              title={t("console.strip.pages.preview_title", { page: name })}
              src={link.url}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              className={cn("rounded-[var(--r-control)] bg-background shadow-[inset_0_0_0_1px_var(--c-hairline)]", wide ? "aspect-[16/10] w-full" : "aspect-[9/16] h-[min(60dvh,560px)]")}
            />
          </div>
        </ConsoleDialog>
      )}
    </>
  );
}
