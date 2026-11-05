/**
 * The stores table while it streams in (platform.md PLA-§4.5 "States"): bones that mirror the final rows (check box,
 * monogram, name and handle, status pill, ring, the activity column), on the table's own surface; never a spinner.
 */
import { cn } from "@/lib/utils";
import styles from "../shell/console.module.css";

export function StoresSkeleton() {
  return (
    <div aria-busy="true" className={cn(styles.skeleton, "overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]")}>
      <div className="h-9 border-b border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--muted)_50%,transparent)]" />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex h-[52px] items-center gap-3 border-b border-[var(--c-hairline)] px-3 last:border-b-0">
          <div className={cn(styles.bone, "size-4 shrink-0 rounded-[4px]")} />
          <div className={cn(styles.bone, "size-8 shrink-0 rounded-[8px]")} />
          <div className="grid w-[24%] gap-1.5">
            <div className={cn(styles.bone, "h-3")} style={{ width: `${60 + ((i * 13) % 35)}%` }} />
            <div className={cn(styles.bone, "h-2.5 w-1/2")} />
          </div>
          <div className={cn(styles.bone, "h-5 w-16 rounded-full")} />
          <div className={cn(styles.bone, "hidden h-3 w-20 lg:block")} />
          <div className={cn(styles.bone, "ms-auto size-6 shrink-0 rounded-full")} />
          <div className={cn(styles.bone, "h-3 w-14 shrink-0")} />
        </div>
      ))}
    </div>
  );
}
