/**
 * The class strings of the console kit (src/components/console/kit.tsx), in a module without "use client" so a server
 * page can use them as plain strings (a client module's exports are client references on the server).
 */
export const card = "min-w-0 rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]";
export const inputCls =
  "h-[var(--ctl)] w-full min-w-0 rounded-[var(--r-control)] bg-background px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-[var(--dur-1)] placeholder:text-muted-foreground/70 focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] disabled:opacity-60 aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11";
export const th = "h-9 px-3 text-start text-[11.5px] font-medium whitespace-nowrap text-muted-foreground";
export const td = "px-3 py-2.5 align-middle text-[12.5px]";

