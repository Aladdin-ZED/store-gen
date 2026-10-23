@AGENTS.md

# Store Gen (cloned from COD Studio, becoming a multi-tenant store-generator SaaS)

Read **docs/HANDOFF.md** first (project state, owner rules, how to deploy to Hostinger, open items), then
**docs/STORE-GEN-BRIEF.md** (the goals for this repo). Deploy target: lightgreen-hippopotamus-140853.hostingersite.com
only. Never deploy this repo to myrizq.shop, which is the separate COD Studio project. `docs/OFFERS.md` is the contract for offers, items, options and per-page pixels.

Always:
- No orange anywhere (OKLCH hue 25–75°, chroma > 0.06), in the admin or the landing pages. Design must be
  maximally modern, smooth and precise, never vintage or generic AI looks.
- Make decisions yourself and keep going; report them at the end.
- Never print, commit or paste `.env.local`, `.env.hostinger*` or tokens.
- Don't kill the owner's dev servers (Store Gen on 3450, COD Studio on 3400). Local MariaDB is root with no password; never `CREATE USER`.
- Pushing to GitHub does **not** deploy. Deploy with the archive method in docs/HANDOFF.md §4 (Hostinger MCP).
