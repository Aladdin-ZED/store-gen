/**
 * GET /dev/fixture/design/health-design — the five design rules of Store Health (P6 DESIGN; design.md DES-§2.10,
 * HR-1; the rules and their `test:health` fixtures in src/lib/health/rules/design.ts). Development only (404 in
 * production). `?lang=fr|ar|en`. Each rule runs on its own firing fixture and on its silent one, and the issue it
 * raises is drawn as the row the Store Health list shows (text, evidence, fix), so each wording and fix can be read
 * in every locale. P2's issue list replaces these rows in the dashboard.
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import "@/components/admin/styles/admin.css";
import { fixtures, rules } from "@/lib/health/rules/design";
import type { HealthInputs, HealthIssue } from "@/lib/health/types";
import { dirOf, translator, type AdminLocale } from "@/lib/i18n/admin";
import type { StoreScope } from "@/lib/tenancy/types";

export const metadata: Metadata = { title: "Design health fixture", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const SCOPE = { kind: "system", storeId: "00000000000000000000000001" } as unknown as StoreScope;
const SEVERITY = ["", "info", "warn", "danger"] as const;

export default async function HealthDesignFixture({ searchParams }: { searchParams: Search }) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const q = await searchParams;
  const lang: AdminLocale = one(q.lang) === "ar" ? "ar" : one(q.lang) === "en" ? "en" : "fr";
  const t = translator(lang);
  const rows: { rule: string; fired: HealthIssue | null; silent: boolean }[] = [];
  for (const fx of fixtures) {
    const rule = rules.find((r) => r.id === fx.rule)!;
    const fired = await rule.collect(SCOPE, fx.fires as HealthInputs).catch(() => null);
    const quiet = await rule.collect(SCOPE, fx.silent as HealthInputs).catch(() => null);
    rows.push({ rule: fx.rule, fired, silent: quiet === null });
  }
  return (
    <main lang={lang} dir={dirOf(lang)} className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto grid max-w-[720px] gap-6">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{t("design.healthFixture.title")}</h1>
        <ul className="grid gap-3">
          {rows.map(({ rule, fired, silent }) => (
            <li key={rule} className="grid gap-3 rounded-xl border bg-card p-4" data-rule={rule} data-severity={fired?.severity ?? 0}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[12px] text-muted-foreground" dir="ltr">
                  {rule}
                </span>
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span aria-hidden className={`size-2 rounded-full ${fired?.severity === 3 ? "bg-destructive" : fired?.severity === 2 ? "bg-[var(--warn)]" : "bg-[var(--brand)]"}`} />
                  <span dir="ltr">
                    {fired ? `${SEVERITY[fired.severity]} · ${fired.points}` : "—"} · silent {silent ? "✓" : "✗"}
                  </span>
                </span>
              </div>
              {fired ? (
                <>
                  <p className="text-[14px] leading-snug text-pretty">{t(fired.text)}</p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[12px] text-muted-foreground tabular-nums" dir="ltr">
                      {fired.evidence.metric} = {fired.evidence.value}
                      {fired.evidence.baseline !== undefined ? ` / ${fired.evidence.baseline}` : ""} · n {fired.evidence.n}
                    </span>
                    <span className="inline-flex h-9 items-center rounded-lg border px-3 text-[13px] font-medium">{t(fired.fix.label)}</span>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-destructive">The firing fixture raised no issue.</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
