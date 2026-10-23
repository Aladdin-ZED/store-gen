#!/usr/bin/env node
/**
 * `npm run dev`: next dev on port 3450 plus the admin Tailwind watcher (scripts/build-admin-css.mjs),
 * so admin class-name edits restyle live. Extra arguments are passed to `next dev`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const children = [
  spawn(process.execPath, ["scripts/build-admin-css.mjs", "--watch"], { stdio: "inherit" }),
  spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-p", "3450", ...process.argv.slice(2)], {
    stdio: "inherit",
  }),
];
const stop = () => children.forEach((c) => c.exitCode === null && c.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children[1].on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
