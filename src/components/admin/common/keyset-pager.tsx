/**
 * KeysetPager (P2 SHELL; platform.md PLA-§22.12, §4.5, PD1, PD26): previous / next for keyset-paged lists; the
 * cursors are opaque tokens (src/lib/platform/cursor.ts) carried in the URL, so every page is linkable.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders nothing without a cursor and otherwise
 * two plain links (`rel` prev / next) to `?<param>=<cursor>`, `param` defaulting to `cursor`; keeping the page's other
 * query parameters, the labels and the RTL arrows are P2's.
 */
import type { ReactElement } from "react";

export interface KeysetPagerProps {
  next: string | null;
  prev: string | null;
  param?: string;
}

export function KeysetPager(p: KeysetPagerProps): ReactElement | null {
  if (p.next === null && p.prev === null) return null;
  const param = p.param ?? "cursor";
  const href = (cursor: string) => `?${new URLSearchParams({ [param]: cursor }).toString()}`;
  return (
    <nav>
      {p.prev !== null && (
        <a rel="prev" href={href(p.prev)}>
          ‹
        </a>
      )}
      {p.next !== null && (
        <a rel="next" href={href(p.next)}>
          ›
        </a>
      )}
    </nav>
  );
}
