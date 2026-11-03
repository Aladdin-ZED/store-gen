"use client";
/**
 * WhatsAppShareButton (P2 SHELL; platform.md PLA-§22.12, §22.7, §22.10.2, PD1, PD61): shares a text (the store address,
 * a private preview link) through a wa.me link in a new tab, `rel="noopener noreferrer"`; with `phone`, to that number
 * (its digits only). Styled as a secondary button (DES-§16.8), the WhatsApp glyph inline-start.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). Default label: "Share on WhatsApp" in the viewer's
 * admin locale.
 */
import type { ReactElement } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { waHref } from "./primitive-logic";
import { FOCUS_RING, TOUCH } from "./ui-classes";

export interface WhatsAppShareButtonProps {
  text: string;
  phone?: string | null;
  label?: string;
}

/** The WhatsApp mark as a single-colour glyph (currentColor), so it follows the button's ink in both modes. */
export function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.98L2 22l5.16-1.5A9.9 9.9 0 1 0 12.04 2Zm0 18.13a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.07.9.91-2.99-.2-.31a8.22 8.22 0 1 1 6.84 3.72Zm4.5-6.15c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.78.97-.14.16-.29.19-.53.06a6.74 6.74 0 0 1-3.37-2.94c-.25-.44.25-.41.72-1.36.08-.16.04-.3-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.47a.9.9 0 0 0-.66.31 2.77 2.77 0 0 0-.86 2.06 4.8 4.8 0 0 0 1 2.55 11 11 0 0 0 4.2 3.7c1.56.68 2.18.73 2.96.62.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

export function WhatsAppShareButton(p: WhatsAppShareButtonProps): ReactElement | null {
  const t = useT();
  return (
    <a
      href={waHref(p.text, p.phone)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2", FOCUS_RING, TOUCH)}
    >
      <WhatsAppGlyph className="size-4 text-success-ink" />
      {p.label ?? t("shell.address.share")}
    </a>
  );
}
