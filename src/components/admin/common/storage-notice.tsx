import { HardDriveIcon } from "lucide-react";
import Link from "next/link";
import type { StoreStorage } from "@/lib/admin-data/assets";
import { cn } from "@/lib/utils";
import { bytes } from "../lib/format";
import { StatusChip } from "./status-chip";

/**
 * The store's media storage against its plan (`storeStorage`, ADM-06): what its photos, cutouts and clips take,
 * never the platform's database. Without a known quota only the size shows.
 */
const percent = (u: StoreStorage) => `${Math.min(100, Math.round(u.ratio * 100))}%`;

/** Compact figure for a screen header (Media). */
export function StorageChip({ usage }: { usage: StoreStorage }) {
  return (
    <StatusChip
      tone={usage.level === "full" ? "red" : usage.level === "warn" ? "warn" : "neutral"}
      dot={usage.level !== "ok"}
      title="Every size and format of your files counts, the originals included."
    >
      {usage.quotaBytes ? `Storage ${bytes(usage.bytes)} of ${bytes(usage.quotaBytes)}` : `Storage ${bytes(usage.bytes)}`}
    </StatusChip>
  );
}

/** Warning line from 80 % of the plan's storage on (nothing below). `mediaHref` adds a link to the library. */
export function StorageNotice({ usage, mediaHref, className }: { usage: StoreStorage | null; mediaHref?: string; className?: string }) {
  if (!usage || usage.level === "ok" || !usage.quotaBytes) return null;
  const full = usage.level === "full";
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm leading-relaxed ring-1 ring-inset",
        full ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-warn/10 text-warn-ink ring-warn/40",
        className,
      )}
    >
      <HardDriveIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="text-pretty">
        <span className="font-medium">
          Your storage is {percent(usage)} full ({bytes(usage.bytes)} of {bytes(usage.quotaBytes)}).
        </span>{" "}
        {full
          ? "New uploads are paused. Delete videos and photos you no longer use to make room."
          : "Uploads stop once it is full. Delete videos and photos you no longer use, and prefer short clips."}
        {mediaHref && (
          <>
            {" "}
            <Link href={mediaHref} className="font-medium underline underline-offset-4">
              Open Media
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
