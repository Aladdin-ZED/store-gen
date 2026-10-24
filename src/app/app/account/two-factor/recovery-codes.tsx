"use client";

import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuthT } from "@/lib/auth/i18n/client";
import { Section } from "@/app/(public)/_components/kit";

/** Shows freshly generated recovery codes once, with copy / download and a "saved" confirmation. */
export function RecoveryCodes({ codes, continueHref }: { codes: string[]; continueHref: string }) {
  const t = useAuthT();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const checkboxId = useId();
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anchor.current?.focus();
  }, []);

  const text = [t("account.2fa.codes_file_title"), t("account.2fa.codes_file_lead", { date: new Date().toISOString().slice(0, 10) }), "", ...codes, ""].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoking in the same tick can cancel the download in some browsers
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div ref={anchor} tabIndex={-1} className="outline-none">
      <Section title={t("account.2fa.codes_title")} description={t("account.2fa.codes_lead")}>
        <ol dir="ltr" className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-[8px] border bg-background p-4 font-mono text-[0.9rem] tracking-wide tabular-nums sm:max-w-md">
          {codes.map((code) => (
            <li key={code} className="select-all">
              {code}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {t(copied ? "account.copied" : "account.copy")}
          </Button>
          <Button type="button" variant="outline" onClick={download}>
            <DownloadIcon aria-hidden="true" />
            {t("account.download")}
          </Button>
        </div>
        <p aria-live="polite" className="sr-only">
          {copied ? t("account.2fa.codes_copied") : ""}
        </p>
        <div className="flex items-center gap-3">
          <Checkbox id={checkboxId} checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
          <Label htmlFor={checkboxId} className="font-normal">
            {t("account.2fa.codes_saved")}
          </Label>
        </div>
        {saved ? (
          <Button asChild variant="brand" className="justify-self-start">
            <Link href={continueHref}>{t("account.continue")}</Link>
          </Button>
        ) : (
          <Button type="button" variant="brand" className="justify-self-start" disabled>
            {t("account.continue")}
          </Button>
        )}
      </Section>
    </div>
  );
}
