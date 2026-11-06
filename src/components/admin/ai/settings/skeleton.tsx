/**
 * Settings → AI loading state (P7 AI; ai.md AI-§K.1 states): one skeleton per section, in the final layout's order
 * and proportions (a segmented row, meters, switch rows, list rows), so nothing jumps when the data streams in.
 */
const bar = "rounded-full bg-foreground/[0.07] motion-safe:animate-pulse";

function Section({ children, lines = 1 }: { children: React.ReactNode; lines?: number }) {
  return (
    <div aria-hidden="true" className="adm-surface grid gap-5 p-5 sm:p-6">
      <div className="grid gap-2">
        <span className={`${bar} h-3.5 w-32`} />
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={`${bar} h-2.5`} style={{ width: `${60 - i * 18}%` }} />
        ))}
      </div>
      {children}
    </div>
  );
}

const Segmented = () => <span className="h-11 rounded-xl bg-foreground/[0.045] motion-safe:animate-pulse sm:h-10" />;
const SwitchLine = () => (
  <div className="flex min-h-11 items-center justify-between gap-4">
    <span className={`${bar} h-3 w-2/5`} />
    <span className="h-5 w-9 rounded-full bg-foreground/[0.08]" />
  </div>
);
const Rows = ({ n }: { n: number }) => (
  <div className="grid gap-px overflow-hidden rounded-xl ring-1 ring-foreground/[0.05]">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-3.5 py-3">
        <span className={`${bar} h-2.5`} style={{ width: `${30 + ((i * 17) % 35)}%` }} />
        <span className={`${bar} ms-auto h-2.5 w-12`} />
      </div>
    ))}
  </div>
);

export function AiSettingsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5" aria-busy="true">
      <div className="grid gap-2 px-1">
        <span className={`${bar} h-4 w-16`} />
        <span className={`${bar} h-3 w-3/5`} />
      </div>
      <Section>
        <Segmented />
        <span className={`${bar} h-2.5 w-1/2`} />
      </Section>
      <Section lines={2}>
        <Segmented />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <span className="h-14 rounded-xl bg-foreground/[0.04]" />
          <span className="h-14 rounded-xl bg-foreground/[0.04]" />
        </div>
        <SwitchLine />
      </Section>
      <Section lines={2}>
        <span className={`${bar} h-3.5 w-3/5`} />
        <span className="h-1.5 rounded-full bg-foreground/[0.07]" />
        <Rows n={5} />
      </Section>
      <Section lines={2}>
        <SwitchLine />
        <Segmented />
        <SwitchLine />
      </Section>
      <Section lines={2}>
        <div className="grid gap-5 md:grid-cols-2">
          <Segmented />
          <Segmented />
        </div>
        <span className="h-24 rounded-xl bg-foreground/[0.03]" />
      </Section>
      <Section lines={2}>
        <Rows n={3} />
        <SwitchLine />
      </Section>
      <Section lines={2}>
        <Rows n={4} />
      </Section>
    </div>
  );
}
