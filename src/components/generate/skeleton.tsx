/**
 * Generator placeholder (server-renderable): the real heading plus the photo step's layout in
 * shimmer, used while the route streams and until the wizard restores its session in the browser.
 */
import { PageHeader } from "@/components/admin/common/page-header";

export const WIZARD_TITLE = (
  <>
    New page<span className="text-brand">.</span>
  </>
);

export const WIZARD_LEAD = (
  <>
    Drop product photos. They&apos;re read on this computer, then three <span className="whitespace-nowrap">art-directed</span> pages are designed for you
    to choose from.
  </>
);

export function WizardSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading the generator…</span>
      <PageHeader title={WIZARD_TITLE} description={WIZARD_LEAD} actions={<div className="adm-shimmer h-9 w-56 rounded-full" />}>
        <div className="adm-shimmer h-[3.75rem] rounded-2xl" />
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="adm-shimmer min-h-[25rem] rounded-[var(--adm-radius)] sm:min-h-[30rem]" />
        <div className="adm-shimmer hidden h-[24rem] rounded-[var(--adm-radius)] lg:block" />
      </div>
    </div>
  );
}
