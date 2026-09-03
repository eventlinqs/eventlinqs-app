# BUILD LEDGER: requirement by requirement

Verdicts are MET, PARTIAL or NOT MET, each with an evidence path. Written after the
brief-roast self review at the close of every phase; item rows are added as items finish.

## Phase A (open)

| Item | Requirement | Verdict | Evidence |
|---|---|---|---|
| A1 | main 48fe08f7 confirmed deployed: sentry-release not 9cf7d365 | MET. It was NOT deployed (blocked build); found why, repaired it, and production served 48fe08f7 within the item, then bfc4a311 after the merge | C:\dev\EVIDENCE\A1\repair-order-access-secret-run.txt, live-smoke-2026-09-03.txt |
| A1 | Find out why and report it | MET. ORDER_ACCESS_SECRET on Production failed the manifest shape (92 characters, whitespace); optional on preview, so the preview built | C:\dev\BUILD-LOG.md, the 13:50 entry |
| A1 | Live smoke: homepage, /events, /pricing, /organisers, community, city, sitemap, og:image; every status logged | MET. Eleven URLs, all 200, before and after the repair; two social cards fetched as real 1200x630 PNGs | C:\dev\EVIDENCE\A1\live-smoke-2026-09-03.txt, og-image-*.png |
| A1 | Fix anything red before building anything new | MET for code and configuration. The one red thing outside my authority is the production catalogue (4 event pages, 2 test artefacts): production data, read only for me, queued for Lawal | C:\dev\REVIEW-QUEUE.md |
| A1 | Completion law 1: schema | n/a, no schema in this item | |
| A1 | Completion law 2: code built, typechecked, linted, no silent catches | MET | C:\dev\EVIDENCE\A1\gates-after-A1.txt, guards-after-A1-with-env.txt |
| A1 | Completion law 3: tests added, canary raised in the same commit | MET (2 files, 7 tests; baseline 250 files / 2984 tests) | tests/unit/ci/vercel-git-deployments.test.ts, tests/unit/ops/repair-order-access-secret.test.ts |
| A1 | Completion law 4: guard | n/a. The invariant (a manifest secret shape) is already a blocking prebuild guard, and it is the guard that caught this | |
| A1 | Completion law 5: driven at 390/768/1440 | MET (21 live screenshots, 7 pages, 3 viewports) | C:\dev\EVIDENCE\A1\*-390.png, *-768.png, *-1440.png |
| A1 | Completion law 6: full regression green | MET (57 guards, tsc, lint, 2984 tests). axe and Lighthouse: no user-facing surface changed in this item | C:\dev\EVIDENCE\A1\ |
| A1 | Completion law 7: committed, Australian English, no trailers, pushed, production deploys green with it | MET (db871881, PR #123, main bfc4a311 served live) | git log; live sentry-release |
