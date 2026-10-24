"use client";
/**
 * The platform's human check (Cloudflare Turnstile, `platform_turnstile`; §B.2 step 2, §B.3): rendered explicitly
 * into the form, its token posted as `cf-turnstile-response` like the widget's own field. The script is loaded once
 * per page with the request's CSP nonce; the widget follows the page language and the colour scheme.
 */
import { useEffect, useRef, useState } from "react";
import type { AdminLocale } from "@/lib/i18n/admin";

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
  reset(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

function loadScript(nonce: string | undefined): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    if (nonce) s.nonce = nonce;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile script"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function TurnstileField({ siteKey, nonce, locale, resetKey }: { siteKey: string; nonce?: string; locale: AdminLocale; /** a new value re-arms the widget (after a refused submit) */ resetKey?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadScript(nonce)
      .then(() => {
        if (cancelled || !box.current || !window.turnstile || widget.current) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: locale,
          theme: "auto",
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, nonce, locale]);

  useEffect(() => {
    if (resetKey === undefined || !widget.current || !window.turnstile) return;
    window.turnstile.reset(widget.current);
    setToken("");
  }, [resetKey]);

  return (
    <div className="grid gap-1">
      <div ref={box} className="min-h-[65px]" />
      <input type="hidden" name="cf-turnstile-response" value={token} />
    </div>
  );
}
