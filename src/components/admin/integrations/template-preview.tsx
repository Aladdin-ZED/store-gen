"use client";
/**
 * The live preview of a template (operations.md OPE-§22.2 "live preview on a recent order", §22.3): the text as the
 * customer reads it, rendered by `renderTemplate` with the values of one stored order (OPE-§7.1; the server sends them,
 * the phone always masked). Without an order (a new store) the variables stay as their names: nothing is invented.
 * Plain text, as WhatsApp shows it: no markup, line breaks kept, the bubble on the reading side of the locale.
 */
import { CheckCheckIcon, SmartphoneIcon } from "lucide-react";
import { useMemo } from "react";
import { useT } from "@/lib/i18n/admin/client";
import { renderTemplate, type TemplateValues } from "@/lib/integrations/template-lang";
import { cn } from "@/lib/utils";

export function TemplatePreview({
  source,
  values,
  phone,
  orderId,
  dir,
  lang,
  className,
}: {
  source: string;
  /** null: no order to preview on (the variables show as their names) */
  values: TemplateValues | null;
  phone: string | null;
  orderId: string | null;
  dir: "ltr" | "rtl";
  lang: string;
  className?: string;
}) {
  const t = useT();
  const text = useMemo(() => (values ? renderTemplate(source, values) : source.replace(/\[\[|\]\]/g, "")), [source, values]);
  return (
    <figure className={cn("grid gap-3", className)}>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground/80">
          <SmartphoneIcon className="size-3.5" aria-hidden="true" />
          {t("int.wae.preview")}
        </span>
        {orderId ? (
          <span>
            {t("int.wae.preview.on")}{" "}
            <bdi dir="ltr" className="font-mono text-foreground/80">
              {orderId}
            </bdi>
            {phone && (
              <>
                {" · "}
                <bdi dir="ltr" className="font-mono">
                  {phone}
                </bdi>
              </>
            )}
          </span>
        ) : (
          <span>{t("int.wae.preview.noOrder")}</span>
        )}
      </figcaption>
      <div className="rounded-2xl bg-foreground/[0.03] p-3 ring-1 ring-foreground/[0.05] ring-inset sm:p-4" dir={dir} lang={lang}>
        <div className="me-6 grid gap-1 rounded-2xl rounded-ss-md bg-background px-3.5 py-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-foreground/[0.06] ring-inset sm:me-12">
          <p className={cn("text-[0.9rem] leading-relaxed break-words whitespace-pre-wrap", !text.trim() && "text-muted-foreground italic")}>{text.trim() ? text : t("int.wae.preview.empty")}</p>
          <span className="flex items-center justify-end gap-1 text-[0.68rem] text-muted-foreground" dir="ltr">
            <CheckCheckIcon className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </figure>
  );
}
