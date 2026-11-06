/**
 * ⌘K commands of the ops track (P4 CALL CENTER, operations.md OPE-§27.7, UX-02; core §I.3, PD66).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; PLA Q.17), imported by ./index.ts. Every command declares its
 * permission and release and runs through the same action or screen the button uses:
 *
 *   ops.next_order       N         agents.self       the console (`/queue`), whose N claims the next order
 *   ops.open_test_order            pages.publish     a test link of the latest published landing (P3's mintTestLink)
 *   ops.export_orders              orders.export     the orders list with the export sheet open (step-up there)
 *   ops.new_manual_order           orders.create     the orders list with the new-order sheet open (the shell's
 *                                                   `C` opens the Create menu, which lists it)
 *   ops.open_calls_now             callcenter.configure   `openCallsNowAction` (2 hours), then the board
 *
 * Store Health fixes name these ids as their `actionId` (PD66).
 *
 * `shortcuts`: the agent console's single-key map (OPE-§13.3, OP-17), registered here so the shell's `?` sheet lists it
 * beside the chords; `test:ops` proves it disjoint from the shell chords (`G O`, `G Q` …). The console itself matches it
 * by `event.code` (src/components/admin/queue/keys.ts).
 */
import { openTestOrderAction } from "@/app/app/[store]/orders/actions";
import { openCallsNowAction } from "@/app/app/[store]/team/callcenter/actions";
import { QUEUE_KEYS, type QueueKey } from "@/components/admin/queue/keys";
import { appHref } from "@/lib/urls";
import type { CommandDef } from "./types";

/** The queue's key map, for the shell's `?` sheet (path, keys, labels of both lanes). */
export const shortcuts: { scope: "queue"; path: "/queue"; keys: readonly QueueKey[] } = { scope: "queue", path: "/queue", keys: QUEUE_KEYS };

const base = (handle: string, path: `/${string}`) => appHref(handle, path);

export const commands: CommandDef[] = [
  {
    id: "ops.next_order",
    label: "ops.cmd.next_order",
    group: "run",
    permission: "agents.self",
    release: "R1",
    shortcut: "N",
    run: (ctx) => ctx.navigate(base(ctx.store.handle, "/queue?next=1")),
  },
  {
    id: "ops.open_test_order",
    label: "ops.cmd.open_test_order",
    group: "run",
    permission: "pages.publish",
    release: "R1",
    run: async (ctx) => {
      const res = await openTestOrderAction();
      if (res.ok && res.data.ok && typeof window !== "undefined") window.open(res.data.data.url, "_blank", "noopener");
      else ctx.navigate(base(ctx.store.handle, "/orders?view=test"));
    },
  },
  {
    id: "ops.export_orders",
    label: "ops.cmd.export_orders",
    group: "run",
    permission: "orders.export",
    release: "R1",
    run: (ctx) => ctx.navigate(base(ctx.store.handle, "/orders?export=1")),
  },
  {
    id: "ops.new_manual_order",
    label: "ops.cmd.new_manual_order",
    group: "create",
    permission: "orders.create",
    release: "R1",
    run: (ctx) => ctx.navigate(base(ctx.store.handle, "/orders?new=1")),
  },
  {
    id: "ops.open_calls_now",
    label: "ops.cmd.open_calls_now",
    group: "run",
    permission: "callcenter.configure",
    release: "R1",
    run: async (ctx) => {
      await openCallsNowAction();
      ctx.navigate(base(ctx.store.handle, "/queue/board"));
    },
  },
];
