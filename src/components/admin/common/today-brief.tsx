"use client";
/**
 * TodayBrief (P2 SHELL; platform.md PLA-§22.12, §22.17, PD62; docs/STORE-SAAS.md §I.6): the dashboard's one to three
 * template lines ("3 orders to confirm", …) with tabular numbers, each optionally a link; never model text (PD62). A
 * line whose source is unavailable is left out by its caller, never written as a made-up 0 (build note item 14).
 *
 * A client component: it translates the lines in the viewer's admin locale (`useT`).
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders each line's message with its vars,
 * as a link when it has `href`, and nothing without lines.
 */
import type { ReactElement } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/tenancy/types";

export interface TodayBriefProps {
  lines: { key: MessageKey; vars: Record<string, string | number>; href?: string }[];
}

export function TodayBrief(p: TodayBriefProps): ReactElement | null {
  const t = useT();
  if (!p.lines.length) return null;
  return (
    <ul>
      {p.lines.map((line, i) => (
        <li key={`${line.key}:${i}`}>{line.href ? <a href={line.href}>{t(line.key, line.vars)}</a> : t(line.key, line.vars)}</li>
      ))}
    </ul>
  );
}
