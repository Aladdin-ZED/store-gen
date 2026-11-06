"use client";
/**
 * Console sentences with left-to-right values isolated (platform.md PLA-§4.7 rule 7): a catalog sentence whose
 * `{handle}`, `{id}`, `{email}`… placeholders render inside `<bdi dir="ltr">`, so a handle keeps its order in an
 * Arabic sentence. A leading "@" before the placeholder moves inside the isolate with it.
 *
 *   const rich = useRichT();
 *   rich("console.attention.brand_term_live", row.vars)   // "<bdi>@souk-nour</bdi>'s page title contains …"
 */
import { Fragment, type ReactNode } from "react";
import type { MessageKey, MessageVars } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";

const LTR_VARS = ["handle", "id", "email", "code", "term", "domain", "key", "version", "root"] as const;
const MARK = /\u0001(\d+)\u0002/;

export function useRichT(): (key: MessageKey, vars?: MessageVars) => ReactNode {
  const t = useT();
  return (key, vars = {}) => {
    const values: string[] = [];
    const marked: MessageVars = { ...vars };
    for (const k of LTR_VARS) {
      if (vars[k] === undefined || vars[k] === "") continue;
      marked[k] = `\u0001${values.length}\u0002`;
      values.push(String(vars[k]));
    }
    if (!values.length) return t(key, vars);
    const parts = t(key, marked).split(MARK);
    const out: ReactNode[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (i % 2 === 0) {
        out.push(<Fragment key={i}>{parts[i + 1] !== undefined && part.endsWith("@") ? part.slice(0, -1) : part}</Fragment>);
        continue;
      }
      const at = parts[i - 1]!.endsWith("@") ? "@" : "";
      out.push(
        <bdi key={i} dir="ltr">
          {at}
          {values[Number(part)]}
        </bdi>,
      );
    }
    return out;
  };
}
