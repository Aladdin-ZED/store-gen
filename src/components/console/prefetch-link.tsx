"use client";
/**
 * A console link that prefetches on hover and focus, not on entering the viewport (PLA-§4.7 rule 1): a sidebar or a
 * list of fifty rows would otherwise fetch every target at once.
 *
 *   <PrefetchLink href="/admin/queue">Approvals</PrefetchLink>
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

export function PrefetchLink({ href, onMouseEnter, onFocus, ...rest }: Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string }) {
  const router = useRouter();
  const warm = () => {
    try {
      router.prefetch(href);
    } catch {
      // prefetching is an optimisation only
    }
  };
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      {...rest}
    />
  );
}
