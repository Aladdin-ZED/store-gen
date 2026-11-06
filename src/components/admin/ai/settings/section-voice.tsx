"use client";
/**
 * Settings → AI, Voice (P7 AI; ai.md AI-§K.1 4, AI-06, AI-§G.2): formality for French, the Darija level for Arabic
 * (tap choices: each is a 2- or 3-step scale), the button text per language, the words to use and to avoid, and a
 * live preview line from the built-in library (no AI call). One explicit Save; a failure keeps every field as typed.
 */
import { XIcon } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsSection } from "@/components/admin/settings/form-kit";
import { cleanWords, previewLine, SETTINGS_LOCALES, type AiSettingsView, type SettingsLocale, type VoiceView } from "@/lib/ai/settings/view";
import { dirOf } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { saveVoiceAction } from "@/app/app/[store]/settings/ai/actions";
import { ChoiceGroup, newKey, SaveError, type SavedState } from "./controls";

const same = (a: VoiceView, b: VoiceView) => JSON.stringify(a) === JSON.stringify(b);

function Words({ label, words, max, onChange, disabled }: { label: string; words: string[]; max: number; onChange: (w: string[]) => void; disabled: boolean }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const add = () => {
    const next = cleanWords([...words, ...draft.split(/[,،]/)], max);
    onChange(next);
    setDraft("");
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) add();
    } else if (e.key === "Backspace" && !draft && words.length) onChange(words.slice(0, -1));
  };
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.8125rem] font-medium">{label}</span>
        <span className="text-[0.75rem] text-muted-foreground tabular-nums">{t("ai.settings.voice.words_n", { n: words.length, max })}</span>
      </div>
      <div className={cn("flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl bg-background px-2 py-1.5 ring-1 ring-input transition-shadow focus-within:ring-2 focus-within:ring-ring", disabled && "opacity-60")}>
        {words.map((w) => (
          <span key={w} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-foreground/[0.06] py-1 ps-2.5 pe-1 text-[0.8125rem]">
            <span className="truncate">{w}</span>
            {!disabled && (
              <button type="button" aria-label={t("ai.settings.voice.remove_word", { word: w })} onClick={() => onChange(words.filter((x) => x !== w))} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:size-5">
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && words.length < max && (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={key}
            onBlur={() => draft.trim() && add()}
            aria-label={label}
            placeholder={words.length ? "" : t("ai.settings.voice.add_word")}
            maxLength={40}
            className="h-8 min-w-[8rem] flex-1 bg-transparent px-1 text-[0.875rem] outline-none placeholder:text-muted-foreground/70"
          />
        )}
      </div>
    </div>
  );
}

export function VoiceSection({ view, locked }: { view: AiSettingsView; locked: boolean }) {
  const t = useT();
  const server = view.settings.voice;
  const [voice, setVoice] = useState<VoiceView>(server);
  const [base, setBase] = useState<VoiceView>(server);
  const [seen, setSeen] = useState(server);
  const [state, setState] = useState<SavedState>({ pending: false, error: null, retry: null });
  const [lang, setLang] = useState<SettingsLocale>(view.storeLocale);
  if (!same(seen, server)) {
    setSeen(server);
    setBase(server);
    if (same(voice, base)) setVoice(server);
  }
  const dirty = !same(voice, base);
  const patch = (p: Partial<VoiceView>) => setVoice((v) => ({ ...v, ...p }));

  const save = (key = newKey()) => {
    const sent = voice;
    setState({ pending: true, error: null, retry: null });
    void saveVoiceAction({ key, voice: sent })
      .then((r) => {
        if (r.ok) {
          setBase(r.data);
          setVoice(r.data);
          setState({ pending: false, error: null, retry: null });
          toast(t("ai.settings.voice.saved"));
        } else setState({ pending: false, error: r.message ? t(r.message) : t("ai.settings.error"), retry: () => save(key) });
      })
      .catch(() => setState({ pending: false, error: t("ai.settings.error"), retry: () => save(key) }));
  };

  const line = previewLine(view, voice, lang);
  return (
    <SettingsSection id="ai-voice" title={t("ai.settings.voice.title")} description={t("ai.settings.voice.lede")}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid gap-2">
        <span className="text-[0.8125rem] font-medium">{t("ai.settings.voice.formality")}</span>
        <ChoiceGroup
          label={t("ai.settings.voice.formality")}
          value={voice.formality}
          onChange={(v) => patch({ formality: v })}
          disabled={locked}
          options={[
            { value: "vous", label: t("ai.settings.voice.vous") },
            { value: "tu", label: t("ai.settings.voice.tu") },
          ]}
        />
        </div>
        <div className="grid gap-2">
        <span className="text-[0.8125rem] font-medium">{t("ai.settings.voice.darija")}</span>
        <ChoiceGroup
          label={t("ai.settings.voice.darija")}
          value={voice.darija}
          onChange={(v) => patch({ darija: v })}
          disabled={locked}
          options={(["none", "cta", "light"] as const).map((d) => ({ value: d, label: t(`ai.settings.voice.darija.${d}`) }))}
        />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[0.8125rem] font-medium">{t("ai.settings.voice.cta")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SETTINGS_LOCALES.map((l) => (
            <label key={l} className="grid gap-1">
              <span className="text-[0.75rem] text-muted-foreground">{t(`ai.settings.voice.locale.${l}`)}</span>
              <Input
                dir={dirOf(l)}
                lang={l}
                value={voice.ctaByLocale[l] ?? ""}
                onChange={(e) => patch({ ctaByLocale: { ...voice.ctaByLocale, [l]: e.target.value } })}
                onFocus={() => setLang(l)}
                placeholder={view.preview[l].cta || t("ai.settings.voice.cta_placeholder")}
                maxLength={32}
                disabled={locked}
                className="h-11 sm:h-9"
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <Words label={t("ai.settings.voice.use")} words={voice.wordsUse} max={12} onChange={(w) => patch({ wordsUse: w })} disabled={locked} />
        <Words label={t("ai.settings.voice.avoid")} words={voice.wordsAvoid} max={24} onChange={(w) => patch({ wordsAvoid: w })} disabled={locked} />
      </div>
      <figure className="grid gap-3 rounded-xl bg-foreground/[0.03] p-4 ring-1 ring-foreground/[0.05] ring-inset">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <figcaption className="text-[0.75rem] font-medium text-muted-foreground">{t("ai.settings.voice.preview")}</figcaption>
          <div role="tablist" aria-label={t("ai.settings.voice.preview")} className="flex gap-1">
            {SETTINGS_LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={cn("min-h-11 rounded-lg px-2.5 text-[0.75rem] font-medium uppercase transition-colors sm:min-h-7", lang === l ? "bg-background text-foreground ring-1 ring-foreground/[0.08]" : "text-muted-foreground hover:text-foreground")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <blockquote dir={dirOf(lang)} lang={lang} className="grid gap-3">
          <p className="text-[1.0625rem] leading-snug font-semibold tracking-[-0.01em] text-balance">{line.headline}</p>
          <span className="inline-flex h-9 w-fit items-center rounded-full bg-foreground px-4 text-[0.8125rem] font-medium text-background">{line.cta}</span>
        </blockquote>
        <p className="text-[0.75rem] text-muted-foreground">{t("ai.settings.voice.preview_note")}</p>
      </figure>
      {!locked && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SaveError state={state} className="me-auto" />
          {dirty && (
            <Button variant="ghost" className="h-11 px-3.5 sm:h-9" disabled={state.pending} onClick={() => setVoice(base)}>
              {t("ai.settings.discard")}
            </Button>
          )}
          <Button className="h-11 px-4 sm:h-9" disabled={!dirty || state.pending} onClick={() => save()}>
            {state.pending ? t("ai.settings.saving") : t("ai.settings.save")}
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}
