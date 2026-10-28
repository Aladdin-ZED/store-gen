/**
 * PanelBoundary (P2 SHELL; platform.md PLA-§22.12, §4.5, PD1): one panel's Suspense and error boundary; the error
 * state reads "This panel couldn't load" with Retry and the error reference (the `error_events` dedupe key).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub is a section named by `title` that wraps its
 * children in Suspense (no fallback); the skeleton and the error boundary with Retry are P2's.
 */
import { Suspense, type ReactElement, type ReactNode } from "react";

export interface PanelBoundaryProps {
  title: string;
  children: ReactNode;
}

export function PanelBoundary(p: PanelBoundaryProps): ReactElement | null {
  return (
    <section aria-label={p.title}>
      <Suspense fallback={null}>{p.children}</Suspense>
    </section>
  );
}
