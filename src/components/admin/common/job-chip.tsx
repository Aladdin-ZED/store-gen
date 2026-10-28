"use client";
/**
 * JobChip (P2 SHELL; platform.md PLA-§22.12, §22.8, PD63; docs/STORE-SAAS.md §H.12, D56): the topbar's background-job
 * indicator fed by `pulse.jobs`: "Working in the background" with a quiet progress ring while jobs run, then
 * "Ready · Open" for 60 s per finished job, dismissible.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders nothing without jobs; otherwise a
 * status region with the running count (when above 0) and one link per finished job, labelled by its `label`, that
 * dismisses it when opened. The ring, the copy and the 60 s timer are P2's.
 */
import type { ReactElement } from "react";

export interface JobChipProps {
  running: number;
  done: { id: string; label: string; href: string }[];
  onDismiss(id: string): void;
}

export function JobChip(p: JobChipProps): ReactElement | null {
  if (p.running <= 0 && !p.done.length) return null;
  return (
    <div role="status">
      {p.running > 0 && <data value={p.running}>{p.running}</data>}
      {p.done.map((job) => (
        <a key={job.id} href={job.href} onClick={() => p.onDismiss(job.id)}>
          {job.label}
        </a>
      ))}
    </div>
  );
}
