---
name: surface-proof
description: Use to produce the visual + performance + accessibility PROOF for any EventLinqs surface (authed or public) - screenshots at 1440 and 390, Lighthouse 95+, and zero serious/critical axe violations - using the reusable Playwright proof harness, including the one-time saved-session login flow for surfaces behind auth or 2FA. Invoke whenever a task says "prove", "capture", "screenshot every surface", "Lighthouse the admin", "axe the dashboard", or before calling a surface done under the CLAUDE.md Definition of Done.
---

# surface-proof

## What this is

The repeatable way to generate the evidence a surface needs to be called done:
full-page screenshots at desktop 1440 and mobile 390 on real data, authenticated
Lighthouse (target 95+), and an axe scan (target 0 serious/critical). It works
for surfaces behind login + 2FA by saving the session once and reusing it.

This is the proof half of the CLAUDE.md **Verification and gates** law and the
`page-build` QA agent brief. A surface is NOT done until this proof passes; report
anything below bar as NOT DONE (CLAUDE.md Definition of Done: nothing ships
partial, zero placeholders, zero dead links, everything works on real data).

## The bar (do not lower it)

- Lighthouse **95+** on desktop AND mobile (median of repeated runs, never a
  single localhost dev run), performance plus a11y/best-practices/SEO.
- axe-core **0 serious/critical** WCAG 2 A/AA violations.
- Screenshots at **1440 and 390**, every surface, populated with **real data**
  (never a thin/empty state passed off as full).
- Every interactive state captured where it matters (e.g. a drawer open AND
  closed; loading, empty, error, populated).
- Zero dead links / zero broken states on the surface (Law 5).

## Reference implementation (copy this shape)

The admin proof harness is the worked example; reuse its pattern:

- `playwright.admin.config.ts` - a `setup` project that opens a headed browser
  for a one-time manual login (login + 2FA), saves `.auth/<area>.json`, and
  `desktop` (1440) + `mobile` (390) projects that reuse it via `storageState`.
  Runs against the local dev server (`npm run dev`).
- `tests/admin-proof/auth.setup.ts` - waits up to 5 minutes for the human to log
  in, then saves the storage state. It never types credentials; it captures the
  session a human establishes (so it respects the auth core, which is never
  touched).
- `tests/admin-proof/surfaces.ts` - the list of `{ name, path, ready }` surfaces.
- `tests/admin-proof/screenshots.spec.ts` - full-page screenshot per surface per
  viewport into `tests/admin-proof/output/<project>/`.
- `tests/admin-proof/drawer.spec.ts` - example of capturing an interactive state
  (the mobile nav drawer open and closed).
- `tests/admin-proof/axe.spec.ts` - axe per surface; fails on any serious/critical
  and prints per-surface counts.
- `scripts/admin-lighthouse.mjs` - authenticated Lighthouse: reads the saved
  session cookies, injects them, runs Lighthouse (via the installed `@lhci/cli`),
  prints median perf/a11y/bp/seo per page.

npm scripts: `admin:proof:setup`, `admin:proof`, `admin:lighthouse`.

## Run it (admin, or any area that has a config)

```
# 1. One-time login (a human logs in, including 2FA). Headed browser opens.
npm run admin:proof:setup

# 2. Screenshots (1440 + 390) + interactive states + axe numbers.
npm run admin:proof

# 3. Authenticated Lighthouse medians.
npm run admin:lighthouse
```

Outputs land in `tests/admin-proof/output/` (gitignored). If a capture bounces to
`/login`, the session expired: re-run step 1.

## Apply to a NEW surface

1. **Authed area:** clone `playwright.admin.config.ts` to
   `playwright.<area>.config.ts` (new `.auth/<area>.json` storage path and a
   `<area>-proof` testDir), copy the four spec files, and edit the surfaces list.
   Reuse `auth.setup.ts` as-is (it just waits for the human to land on a signed-in
   page, then saves state).
2. **Public surface (no auth):** drop the `setup` project and `storageState`; run
   the screenshots/axe specs directly, and use the existing public-page Lighthouse
   gate (`.github/workflows/lighthouse.yml`) which already audits the warmed Vercel
   preview at error-level - prefer that over a local run for public pages.
3. Keep the surfaces list to **public-in-area, no-auth-handoff** routes (the same
   exclusion the gate uses for order-confirmation / squad token pages).

## Common mistakes

- Calling a surface done on a single localhost dev Lighthouse run. Median, and
  prefer the warmed preview for public pages.
- Screenshotting a thin or empty surface. Capture real, full data (Density-proof
  rule in `page-build`).
- Forgetting an interactive state (a drawer/menu/modal open). Capture both states.
- Typing credentials in the setup. Never automate the login; a human establishes
  the session and the harness only saves it (auth core stays untouched).
- Committing `.auth/*.json` or the screenshot output. Both are gitignored; keep it
  that way (session cookies and tokens must never be committed).
