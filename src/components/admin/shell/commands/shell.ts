/**
 * ⌘K commands of the shell track (P2 SHELL, platform.md PLA-§22.13; docs/STORE-SAAS.md §I.3).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; PLA Q.17), created empty at P0 and imported by ./index.ts.
 *
 * Create (the `C` menu): a landing page (landing / both), an invite. Jump: switch store, notifications. Run: Help, the
 * shortcut sheet, theme, density, language, Recompute Store Health (`recomputeHealthAction`, `store.read`), Install
 * the app. Links go through `ctx.navigate`; the rest through the shell's services (../shell-bridge.ts), so this file
 * stays isomorphic. A `HealthFix` of kind `action` names a command id here or in a track's file (PD66: the health
 * panel runs the command with that id, e.g. P5's `integrations.sync_sheets`).
 */
import { appHref } from "@/lib/urls";
import { shellServices } from "../shell-bridge";
import type { CommandDef } from "./types";

export const commands: CommandDef[] = [
  {
    id: "shell.create_page",
    label: "shell.cmd.create_page",
    group: "create",
    permission: "pages.write",
    mode: "landing",
    run: (ctx) => ctx.navigate(appHref(ctx.store.handle, "/generate")),
  },
  {
    id: "shell.invite",
    label: "shell.cmd.invite",
    group: "create",
    permission: "members.invite",
    run: (ctx) => ctx.navigate(appHref(ctx.store.handle, "/team?invite=1")),
  },
  { id: "shell.switch_store", label: "shell.cmd.switch_store", group: "jump", shortcut: "G W", run: () => shellServices()?.openPalette("stores") },
  {
    id: "shell.notifications",
    label: "shell.cmd.notifications",
    group: "jump",
    permission: "store.read",
    shortcut: "G N",
    run: (ctx) => ctx.navigate(appHref(ctx.store.handle, "/notifications")),
  },
  { id: "shell.help", label: "shell.cmd.help", group: "run", run: () => shellServices()?.openHelp() },
  { id: "shell.shortcuts", label: "shell.cmd.shortcuts", group: "run", shortcut: "?", run: () => shellServices()?.openShortcuts() },
  { id: "shell.toggle_theme", label: "shell.cmd.toggle_theme", group: "run", run: () => shellServices()?.toggleTheme() },
  { id: "shell.toggle_density", label: "shell.cmd.toggle_density", group: "run", run: () => shellServices()?.toggleDensity() },
  { id: "shell.language", label: "shell.cmd.language", group: "run", run: () => shellServices()?.openPalette("language") },
  { id: "shell.recompute_health", label: "shell.cmd.recompute_health", group: "run", permission: "store.read", run: () => shellServices()?.recomputeHealth() },
  { id: "shell.install_app", label: "shell.cmd.install_app", group: "run", run: () => shellServices()?.installApp() },
];

/** ⌘K keywords of the shell commands (any language the seller types; the label itself always matches). */
export const COMMAND_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  "shell.create_page": ["generate", "new", "landing", "page", "créer", "صفحة"],
  "shell.invite": ["member", "team", "agent", "inviter", "فريق"],
  "shell.switch_store": ["store", "boutique", "متجر"],
  "shell.notifications": ["bell", "alerts", "إشعارات"],
  "shell.help": ["support", "whatsapp", "aide", "مساعدة"],
  "shell.shortcuts": ["keyboard", "keys", "clavier", "اختصارات"],
  "shell.toggle_theme": ["dark", "light", "mode", "sombre", "داكن"],
  "shell.toggle_density": ["compact", "rows", "dense", "مضغوط"],
  "shell.language": ["arabic", "french", "english", "langue", "lang", "لغة", "العربية", "français"],
  "shell.recompute_health": ["health", "ring", "score", "santé", "صحة"],
  "shell.install_app": ["pwa", "home screen", "app", "تطبيق"],
};
