/**
 * ⌘K commands of the integrations track (P5 INTEGRATIONS, operations.md OPE-§27.7, UX-02; core §I.3, PD66).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; PLA Q.17), imported by ./index.ts. Every command declares its
 * permission and release and runs through the same action the screen's button uses:
 *
 *   integrations.sync_sheets       integrations.manage   `syncSheetNowAction` (Sync now), then the Sheets screen on a
 *                                                        refusal (not connected, paused, the bucket); the id the
 *                                                        `int:sheets_backlog` health fix names
 *   integrations.send_test_event   integrations.manage   `sendTestEventAction` (the store's first pixel with a token and
 *                                                        a test code), then the Pixels screen when none is ready
 *   integrations.replay_dead       integrations.manage   opens `/integrations#deliveries` filtered on dead rows (the
 *                                                        Replay buttons are there: one click per row or per kind)
 *
 * Results show as toasts (sonner, loaded on run: this file is also read by node checks).
 */
import { sendTestEventAction } from "@/app/app/[store]/integrations/pixels/actions";
import { syncSheetNowAction } from "@/app/app/[store]/integrations/sheets/actions";
import { isAdminLocale, messageOf, t, type AdminLocale } from "@/lib/i18n/admin";
import { appHref } from "@/lib/urls";
import type { CommandDef } from "./types";

/** The admin's locale on screen (the shell sets <html lang>), English elsewhere. */
const viewerLocale = (): AdminLocale => {
  const lang = typeof document === "undefined" ? "en" : document.documentElement.lang.slice(0, 2);
  return isAdminLocale(lang) ? lang : "en";
};

/** A toast in the browser (no-op elsewhere): a message key in the viewer's locale, or a server's plain-words text. */
async function toast(kind: "success" | "error", text: string, vars?: Record<string, number>): Promise<void> {
  if (typeof window === "undefined") return;
  const { toast: show } = await import("sonner");
  show[kind](messageOf(text, viewerLocale()) !== undefined || messageOf(text) !== undefined ? t(text, vars, viewerLocale()) : text);
}

export const commands: CommandDef[] = [
  {
    id: "integrations.sync_sheets",
    label: "int.cmd.sync_sheets",
    group: "run",
    permission: "integrations.manage",
    release: "R1",
    run: async (ctx) => {
      const res = await syncSheetNowAction();
      if (res.ok && !res.data.skipped && !res.data.message) {
        const { appended, updated, pulled } = res.data;
        await toast("success", appended + updated + pulled > 0 ? "int.cmd.sync_sheets.done" : "int.cmd.sync_sheets.nothing", { sent: appended + updated, pulled });
        return;
      }
      if (res.ok && res.data.message) await toast("error", res.data.message);
      else if (!res.ok && res.message) await toast("error", res.message);
      ctx.navigate(appHref(ctx.store.handle, "/integrations/sheets"));
    },
  },
  {
    id: "integrations.send_test_event",
    label: "int.cmd.send_test_event",
    group: "run",
    permission: "integrations.manage",
    release: "R1",
    run: async (ctx) => {
      const res = await sendTestEventAction(null);
      if (res.ok && res.data.ok) return void (await toast("success", "int.cmd.send_test_event.done"));
      // no pixel ready (the action's words), or the ad platform refused the event
      await toast("error", !res.ok && res.message ? res.message : "int.cmd.send_test_event.refused");
      ctx.navigate(appHref(ctx.store.handle, "/integrations/pixels#server-events"));
    },
  },
  {
    id: "integrations.replay_dead",
    label: "int.cmd.replay_dead",
    group: "run",
    permission: "integrations.manage",
    release: "R1",
    run: (ctx) => ctx.navigate(appHref(ctx.store.handle, "/integrations?state=dead#deliveries")),
  },
];
