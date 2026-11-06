/**
 * The ops pages' answer for an id the viewer can't see (P4 CALL CENTER; core §E.3 rule 3): one quiet panel, identical
 * for a missing id and another store's, with the way back. A server component.
 */
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

export function NotAvailable({ text, back }: { text: string; back: { href: string; label: string } }) {
  return (
    <div className="grid gap-6">
      <Link href={back.href} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {back.label}
      </Link>
      <p role="status" className="rounded-[18px] border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
        {text}
      </p>
    </div>
  );
}
