import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import type { ChecklistItem } from "@/lib/admin-data/dashboard";
import { cn } from "@/lib/utils";

const COPY: Record<ChecklistItem["id"], { title: string; text: string }> = {
  store: { title: "Add your store details", text: "Name, phone or WhatsApp — shown in footers and legal pages." },
  sheets: { title: "Connect Google Sheets", text: "Every order lands in your call-center sheet automatically." },
  twofactor: { title: "Turn on two-step verification", text: "A code from your phone at every sign-in." },
  publish: { title: "Publish your first page", text: "Generate a page from product photos, then go live." },
  home: { title: "Choose the home page", text: "The page visitors see at your domain's root." },
};

/** Setup progress: ring + ordered steps; done steps settle into a quiet checked state. */
export function SetupChecklist({ items, className }: { items: ChecklistItem[]; className?: string }) {
  const done = items.filter((i) => i.done).length;
  const ratio = items.length ? done / items.length : 1;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <section className={cn("adm-surface adm-rise flex flex-col gap-4 p-5 sm:p-6", className)} style={{ ["--i" as string]: 5 }} aria-label="Setup checklist">
      <div className="flex items-center gap-4">
        <div className="relative size-14 shrink-0">
          <svg viewBox="0 0 48 48" className="size-14 -rotate-90" aria-hidden="true">
            <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-foreground/[0.07]" />
            <circle
              cx="24"
              cy="24"
              r={r}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-brand transition-[stroke-dashoffset] duration-1000 ease-out"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - ratio)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[0.8rem] font-semibold tabular-nums">
            {done}/{items.length}
          </span>
        </div>
        <div className="grid gap-0.5">
          <h2 className="text-[0.95rem] font-semibold">{done === items.length ? "You're all set" : "Finish setting up"}</h2>
          <p className="text-sm text-muted-foreground">
            {done === items.length ? "Everything a COD store needs is in place." : `${items.length - done} step${items.length - done === 1 ? "" : "s"} left before you're fully live.`}
          </p>
        </div>
      </div>
      <ol className="grid gap-1">
        {items.map((item, i) => {
          const copy = COPY[item.id];
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-200 outline-none hover:bg-foreground/[0.035] focus-visible:ring-2 focus-visible:ring-ring/60",
                  item.done && "opacity-70 hover:opacity-100",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold transition-colors",
                    item.done ? "bg-emerald-500 text-white shadow-[0_4px_10px_-4px_rgb(16_185_129/0.6)]" : "bg-foreground/[0.06] text-foreground/60 ring-1 ring-foreground/10 ring-inset",
                  )}
                >
                  {item.done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={cn("text-sm font-medium", item.done && "text-muted-foreground line-through decoration-foreground/20")}>{copy.title}</span>
                  {!item.done && <span className="text-xs leading-snug text-muted-foreground">{copy.text}</span>}
                </span>
                {!item.done && (
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-foreground rtl:rotate-180" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
