"use client";
/**
 * The `platform_design` field group of the console's General settings (P6 DESIGN; platform.md PLA-§13.1, design.md
 * DES-§2.7, DES-R8; P0b CCR P1-5, P6-17): the novelty check mode, the publish-gate incident switch, the slop limits and
 * the novelty thresholds, mounted by P1 on /admin/settings/general with `{ value, onSave }` (the frozen props of
 * src/lib/contracts/r1-p0b-design.ts). The parent's `onSave` runs `savePlatformDesignAction` (`platform.settings`,
 * audited `platform.design.changed`); the server validates again with `PlatformDesign`, so the bounds here only keep a
 * typo from reaching it. An empty threshold means "the calibration's value" (the field is optional in the schema).
 */
import { useEffect, useState, type ReactElement } from "react";
import { button, Field, inputCls, Segmented } from "@/components/console/kit";
import { useT } from "@/lib/i18n/admin/client";
import type { PlatformDesignSetting } from "@/lib/settings/keys/platform-design";
import { cn } from "@/lib/utils";

type ThresholdKey = keyof PlatformDesignSetting["thresholds"];
/** the schema's bounds (src/lib/settings/keys/platform-design.ts); the floors are the R-D36 numbers */
const THRESHOLDS: readonly { key: ThresholdKey; min: number; max: number }[] = [
  { key: "platform", min: 0.25, max: 0.6 },
  { key: "niche", min: 0.4, max: 0.8 },
  { key: "ownPage", min: 0.3, max: 0.7 },
  { key: "brandRadius", min: 0.2, max: 0.35 },
  { key: "clone", min: 0.12, max: 0.25 },
];

type Draft = {
  novelty: PlatformDesignSetting["novelty"];
  gatesAtPublish: PlatformDesignSetting["gatesAtPublish"];
  fail: string;
  repair: string;
  thresholds: Record<ThresholdKey, string>;
};

function draftOf(v: PlatformDesignSetting): Draft {
  const thresholds = Object.fromEntries(THRESHOLDS.map(({ key }) => [key, v.thresholds[key] === undefined ? "" : String(v.thresholds[key])])) as Record<ThresholdKey, string>;
  return { novelty: v.novelty, gatesAtPublish: v.gatesAtPublish, fail: String(v.slop.fail), repair: String(v.slop.repair), thresholds };
}

const num = (s: string): number | null => (/^\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : null);
const int = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

export function PlatformDesignFields({ value, onSave }: { value: PlatformDesignSetting; onSave(v: PlatformDesignSetting): Promise<void> }): ReactElement | null {
  const t = useT();
  const [d, setD] = useState<Draft>(() => draftOf(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setD(draftOf(value)), [value]);

  const fail = int(d.fail);
  const repair = int(d.repair);
  const okFail = fail !== null && fail >= 4 && fail <= 10;
  const okRepair = repair !== null && repair >= 2 && repair <= 5;
  const thresholdProblem = (key: ThresholdKey): boolean => {
    const raw = d.thresholds[key].trim();
    if (!raw) return false;
    const n = num(raw);
    const b = THRESHOLDS.find((x) => x.key === key)!;
    return n === null || n < b.min || n > b.max;
  };
  const valid = okFail && okRepair && THRESHOLDS.every(({ key }) => !thresholdProblem(key));
  const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(value));

  const next = (): PlatformDesignSetting => {
    const thresholds: PlatformDesignSetting["thresholds"] = {};
    for (const { key } of THRESHOLDS) {
      const n = num(d.thresholds[key]);
      if (n !== null) thresholds[key] = n;
    }
    return { ...value, novelty: d.novelty, gatesAtPublish: d.gatesAtPublish, slop: { fail: fail!, repair: repair! }, thresholds };
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <p className="text-[12.5px] font-medium">{t("design.platform.novelty")}</p>
        <Segmented
          label={t("design.platform.novelty")}
          value={d.novelty}
          onChange={(novelty) => setD({ ...d, novelty })}
          options={[
            { value: "on", label: t("design.platform.novelty.on"), note: t("design.platform.novelty.on_note") },
            { value: "warn", label: t("design.platform.novelty.warn"), note: t("design.platform.novelty.warn_note") },
            { value: "off", label: t("design.platform.novelty.off"), note: t("design.platform.novelty.off_note") },
          ]}
        />
      </div>
      <div className="grid gap-1.5">
        <p className="text-[12.5px] font-medium">{t("design.platform.gates")}</p>
        <Segmented
          label={t("design.platform.gates")}
          value={d.gatesAtPublish}
          onChange={(gatesAtPublish) => setD({ ...d, gatesAtPublish })}
          options={[
            { value: "block", label: t("design.platform.gates.block"), note: t("design.platform.gates.block_note") },
            { value: "warn", label: t("design.platform.gates.warn"), note: t("design.platform.gates.warn_note") },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("design.platform.slop_fail")} hint={t("design.platform.range", { min: 4, max: 10 })} problem={okFail ? null : t("design.platform.out_of_range", { min: 4, max: 10 })}>
          {(id, describedBy) => <input id={id} aria-describedby={describedBy} aria-invalid={!okFail} inputMode="numeric" className={inputCls} value={d.fail} onChange={(e) => setD({ ...d, fail: e.target.value })} />}
        </Field>
        <Field label={t("design.platform.slop_repair")} hint={t("design.platform.range", { min: 2, max: 5 })} problem={okRepair ? null : t("design.platform.out_of_range", { min: 2, max: 5 })}>
          {(id, describedBy) => <input id={id} aria-describedby={describedBy} aria-invalid={!okRepair} inputMode="numeric" className={inputCls} value={d.repair} onChange={(e) => setD({ ...d, repair: e.target.value })} />}
        </Field>
      </div>
      <div className="grid gap-1.5">
        <p className="text-[12.5px] font-medium">{t("design.platform.thresholds")}</p>
        <p className="text-[12px] text-muted-foreground">{t("design.platform.thresholds_lead")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THRESHOLDS.map(({ key, min, max }) => {
            const bad = thresholdProblem(key);
            return (
              <Field key={key} label={t(`design.platform.threshold.${key}`)} optional hint={t("design.platform.range", { min, max })} problem={bad ? t("design.platform.out_of_range", { min, max }) : null}>
                {(id, describedBy) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={bad}
                    inputMode="decimal"
                    placeholder={t("design.platform.calibrated")}
                    className={inputCls}
                    value={d.thresholds[key]}
                    onChange={(e) => setD({ ...d, thresholds: { ...d.thresholds, [key]: e.target.value } })}
                  />
                )}
              </Field>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && (
          <button type="button" onClick={() => setD(draftOf(value))} className={cn(button.base, button.ghost)}>
            {t("console.form.reset")}
          </button>
        )}
        <button
          type="button"
          disabled={!dirty || !valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(next());
            } finally {
              setBusy(false);
            }
          }}
          className={cn(button.base, button.primary)}
        >
          {t("design.platform.save")}
        </button>
      </div>
    </div>
  );
}
