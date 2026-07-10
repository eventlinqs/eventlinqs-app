# Admin proof harness

Authenticated visual + accessibility + performance proof for the admin console.
Admin is behind login + 2FA, so these need a real session once; after that every
capture reuses it.

## One-time login (you, with your 2FA)

```
npx playwright test --config playwright.admin.config.ts --project setup --headed
```

A real browser opens at `/admin/login`. Log in including the 2FA code. When the
operations dashboard loads, the session is saved to `.auth/admin.json`
(gitignored). The local dev server is started automatically (or reused).

## Screenshots + axe (desktop 1440 and mobile 390)

```
npx playwright test --config playwright.admin.config.ts --project desktop
npx playwright test --config playwright.admin.config.ts --project mobile
```

- Full-page screenshots of every admin surface land in
  `tests/admin-proof/output/<desktop|mobile>/`.
- The mobile run also captures the nav drawer closed and open
  (`drawer-closed.png`, `drawer-open.png`).
- axe scans every surface and fails on any serious/critical WCAG 2 A/AA
  violation, printing the per-surface counts.

## Lighthouse (authenticated, desktop, median of 3)

With a server on :3000 and `.auth/admin.json` saved:

```
node scripts/admin-lighthouse.mjs
```

Prints the median performance / accessibility / best-practices / SEO score per
admin page. Target: performance >= 95, a11y/best-practices = 100.

## Notes

- If a capture bounces to `/admin/login`, the session expired: re-run the setup
  project.
- Surfaces covered: dashboard, refunds, disputes, kyc, search, notifications,
  events, organisers, payouts, staff.
