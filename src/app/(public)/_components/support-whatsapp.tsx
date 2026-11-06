import { MessageCircleIcon } from "lucide-react";
import { waHref } from "@/components/admin/common/primitive-logic";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "./control";

/** The support WhatsApp button of the sign-in screens (`platform.brand.supportWhatsapp`, E.164; PLA-§22.1, §3.1). */
export function SupportWhatsApp({ phone, label, className }: { phone: string; label: string; className?: string }) {
  return (
    <a
      href={waHref("", phone)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        CONTROL_CLASS,
        "inline-flex w-full items-center justify-center gap-2 rounded-[var(--r-control)] bg-card px-4 font-medium ring-1 ring-border ring-inset transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <MessageCircleIcon aria-hidden="true" className="size-4" />
      {label}
    </a>
  );
}
