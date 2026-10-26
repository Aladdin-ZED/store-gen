"use client";
/**
 * Add a pixel / Edit token & test code (owners). Add: platform, id validated as you type (ID_HELP),
 * label, and for Meta / TikTok the server token and the test event code. Edit: the id is immutable
 * (to move pages to another id use Replace on pages…). "Send test event" sends a synthetic Purchase
 * with the test code and shows the platform's own answer.
 */
import { CircleAlertIcon, CircleCheckIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { sendPixelTestAction, savePixelEntryAction } from "@/lib/pixels/actions";
import type { TestEventResult } from "@/lib/orders/conversions-core";
import { ID_HELP, TEST_CODE_RE, TOKEN_RE, isMask } from "@/lib/pixels/form";
import { PIXEL_ID_RE, PIXEL_PLATFORMS, isServerPlatform, normalizePixelId, type PixelPlatform, type ServerPlatform } from "@/lib/pixels/ids";
import { LABEL_MAX, findEntryView, type LibraryPixel, type PixelLibraryView } from "@/lib/pixels/library";
import { cn } from "@/lib/utils";
import { Segmented } from "../common/segmented";
import { runAction } from "../lib/action-result";
import { Field, SecretInput, TextInput } from "../settings/form-kit";
import { PLATFORM_META, PlatformMark } from "./parts";

export type EntryMode = { kind: "add"; platform?: PixelPlatform; id?: string } | { kind: "edit"; pixel: LibraryPixel; focusTest?: boolean };

export function PixelEntryDialog({
  open,
  onOpenChange,
  mode,
  library,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EntryMode;
  library: PixelLibraryView | null;
  /** the saved pixel and the fresh library view */
  onSaved: (pixel: { platform: PixelPlatform; id: string }, view: PixelLibraryView) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-lg">
        {open && <EntryForm key={mode.kind === "edit" ? `${mode.pixel.platform}:${mode.pixel.id}` : "add"} mode={mode} library={library} onSaved={onSaved} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({ mode, library, onSaved, onClose }: { mode: EntryMode; library: PixelLibraryView | null; onSaved: (p: { platform: PixelPlatform; id: string }, v: PixelLibraryView) => void; onClose: () => void }) {
  const editing = mode.kind === "edit" ? mode.pixel : null;
  const [platform, setPlatform] = useState<PixelPlatform>(editing?.platform ?? (mode.kind === "add" ? (mode.platform ?? "meta") : "meta"));
  const [rawId, setRawId] = useState(editing?.id ?? (mode.kind === "add" ? (mode.id ?? "") : ""));
  const [label, setLabel] = useState(editing?.label ?? "");
  const [token, setToken] = useState(editing?.tokenMask ?? "");
  const [testCode, setTestCode] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestEventResult | null>(null);
  const formId = useId();
  const meta = PLATFORM_META[platform];
  const server = isServerPlatform(platform);
  const id = normalizePixelId(platform, rawId);

  const idError = useMemo(() => {
    if (editing) return undefined;
    if (!id) return touched ? "Add the pixel ID." : undefined;
    if (!PIXEL_ID_RE[platform].test(id)) return ID_HELP[platform];
    if (findEntryView(library, platform, id)) return "This pixel is already in the library.";
    return undefined;
  }, [editing, id, platform, touched, library]);
  const tokenError = token && !isMask(token) && !TOKEN_RE.test(token.trim()) ? "This doesn't look like a valid token — paste it again." : undefined;
  const codeValue = testCode ?? "";
  const codeError = testCode && !TEST_CODE_RE.test(testCode.replace(/\s+/g, "").toUpperCase()) ? "4–20 capital letters and digits, e.g. TEST12345." : undefined;
  const canSave = !idError && !!id && !tokenError && !codeError && !saving;
  const hasCode = testCode !== null ? !!testCode : !!editing?.testCode;
  const hasToken = !!token.trim();
  const canTest = server && !!editing && hasToken && hasCode && !tokenError && !codeError && !testing;

  const save = async () => {
    setTouched(true);
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await runAction(
        savePixelEntryAction({
          platform,
          id,
          label,
          ...(server ? { token: token.trim() } : {}),
          ...(server && testCode !== null ? { testCode } : {}),
        }),
        { success: editing ? "Pixel saved" : "Pixel added to the library" },
      );
      if (res) {
        onSaved({ platform, id }, res.view);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!canTest || !editing) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await runAction(sendPixelTestAction({ platform: platform as ServerPlatform, id, token: token.trim(), testCode: testCode ?? "" }));
      if (res) setResult(res);
    } finally {
      setTesting(false);
    }
  };

  return (
    <form
      id={formId}
      className="grid"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-1.5 border-b border-border/60 px-6 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <PlatformMark platform={platform} />
          <div className="grid min-w-0">
            <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{editing ? `Edit ${editing.label || meta.name + " pixel"}` : "Add a pixel"}</DialogTitle>
            <DialogDescription className="text-[0.8rem] text-muted-foreground">
              {editing ? "The ID stays the same — to move pages to another pixel, use Replace on pages." : "Saved pixels appear in the wizard and the builder. Pages only fire the pixels you pick for them."}
            </DialogDescription>
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-6 py-5">
        {!editing && (
          <Segmented
            label="Platform"
            size="sm"
            value={platform}
            onChange={(p) => {
              setPlatform(p);
              setResult(null);
            }}
            options={PIXEL_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p].short }))}
            className="w-full justify-between sm:w-fit"
          />
        )}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Field label={meta.idLabel} error={idError} hint={editing ? undefined : meta.where.id}>
            {(fp) => (
              <TextInput
                {...fp}
                value={rawId}
                readOnly={!!editing}
                onChange={(e) => setRawId(e.target.value)}
                onBlur={(e) => {
                  setTouched(true);
                  const n = normalizePixelId(platform, e.target.value);
                  if (n !== e.target.value) setRawId(n);
                }}
                placeholder={meta.placeholder}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                autoFocus={!editing}
                dir="ltr"
                inputMode={platform === "meta" ? "numeric" : undefined}
                className={cn("font-mono text-[0.82rem]", editing && "bg-muted/60 text-muted-foreground")}
              />
            )}
          </Field>
          <Field label="Label" optional hint="So you recognize it: “Compte principal”, “BM backup”.">
            {(fp) => <TextInput {...fp} value={label} maxLength={LABEL_MAX} onChange={(e) => setLabel(e.target.value)} placeholder={`${meta.short} principal`} dir="auto" autoFocus={!!editing && !(mode.kind === "edit" && mode.focusTest)} />}
          </Field>
        </div>

        {server && (
          <div className="grid gap-4 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.06] ring-inset">
            <div className="grid gap-0.5">
              <p className="text-sm font-medium">Server events</p>
              <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
                With a token, every order of the pages using this pixel is also sent from the server — ad blockers can&apos;t stop it, and {meta.name} counts it once.
              </p>
            </div>
            <Field
              label={meta.tokenLabel}
              optional
              error={tokenError}
              hint={isMask(token) ? "Saved and encrypted. Type over it to replace it, clear it to stop server events." : meta.where.token}
            >
              {(fp) => (
                <SecretInput
                  {...fp}
                  value={token}
                  onChange={(v) => {
                    setToken(v);
                    setResult(null);
                  }}
                  placeholder="Paste the token"
                />
              )}
            </Field>
            <Field
              label="Test event code"
              optional
              error={codeError}
              hint={
                testCode === null && editing?.testCode
                  ? "A code is saved. It is used only while you test a page (builder → Test this page), never for real orders."
                  : "Used only while you test a page, never for real orders. " + (meta.where.test ?? "")
              }
            >
              {(fp) => (
                <div className="flex items-center gap-2">
                  <TextInput
                    {...fp}
                    value={codeValue}
                    onChange={(e) => {
                      setTestCode(e.target.value.toUpperCase());
                      setResult(null);
                    }}
                    placeholder={testCode === null && editing?.testCode ? "Saved — type to replace" : "TEST12345"}
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus={mode.kind === "edit" && !!mode.focusTest}
                    dir="ltr"
                    className="font-mono text-[0.82rem]"
                  />
                  {editing?.testCode && testCode !== "" ? (
                    <Button type="button" variant="ghost" size="sm" className="h-10 shrink-0 rounded-xl text-muted-foreground" onClick={() => setTestCode("")}>
                      Clear
                    </Button>
                  ) : null}
                </div>
              )}
            </Field>
            {editing && (
              <div className="grid gap-2.5">
                <Button type="button" variant="outline" className="h-9 w-fit rounded-full" onClick={sendTest} disabled={!canTest}>
                  {testing ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
                  Send test event
                </Button>
                {!hasToken || !hasCode ? <p className="text-xs text-muted-foreground">Needs a token and a test event code.</p> : null}
                {result && (
                  <div
                    role="status"
                    className={cn(
                      "grid gap-1 rounded-xl p-3 text-[0.8rem] ring-1 ring-inset",
                      result.ok ? "bg-emerald-500/[0.07] text-emerald-800 ring-emerald-500/20 dark:text-emerald-200" : "bg-warn/10 text-warn-ink ring-warn/35",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      {result.ok ? <CircleCheckIcon className="size-4" /> : <CircleAlertIcon className="size-4" />}
                      {result.message}
                    </span>
                    {result.facts.length ? (
                      <span dir="ltr" className="font-mono text-[0.7rem] opacity-80">
                        {result.facts.join(" · ")}
                      </span>
                    ) : null}
                    {result.ok ? <span className="text-xs opacity-80">Look for {result.eventName} in Events Manager → Test events (event id {result.eventId}).</span> : null}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-border/60 bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="rounded-full" disabled={!canSave}>
          {saving && <Loader2Icon className="animate-spin" />}
          {editing ? "Save" : "Add pixel"}
        </Button>
      </div>
    </form>
  );
}
