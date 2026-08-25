# Roast ledger: the six-task session, 25 August 2026

Written BEFORE adjudication, from the brief verbatim, so the ledger cannot be
shaped to fit what happened to get done.

Branch `integration/launch`. Commits `e6d8d65c`, `a63637a9`, `c13e557e`,
`29a408f8`, `03975215`, `84b58dcb`, all pushed.

---

## Phase 1: the requirement ledger

### TASK 0 - baseline

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 0.1 | Report git status, HEAD, anything uncommitted | MET | HEAD `00a5be70`, branch `integration/launch`, `origin/integration/launch` identical. 11 untracked `tmp-*` probe files from a previous session, no tracked modifications |
| 0.2 | PR #120's checks queried directly | MET | `gh pr checks 120`: Lighthouse mobile gate FAIL, 4 pass, 3 skipping, Vercel pass. Only failing check confirmed |
| 0.3 | Finish anything half-applied | MET | Nothing was half-applied: working tree held no tracked modifications, only untracked probe scripts |
| 0.4 | npm test, counts from the JSON reporter not the console | MET | 223 files, 2764 tests, 2764 passed, 0 failed, 0 skipped, 0 todo, success true. 12 tracked spec files not run, all Playwright (`tests/e2e/*`, `tests/admin-proof/*`), named |
| 0.5 | Full guard runner with a verdict per guard | MET | 44 guards, all PASS, verdict printed per guard; the five reporting `OK:` rather than `PASS` named individually |
| 0.6 | `npm run build` against TEST, unpiped, raw `$LASTEXITCODE` | MET | `RAW_LASTEXITCODE=0`, PowerShell, `.next` cleared, `.env.test` loaded into the shell |

### TASK 1 - the dead URL sweep

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1a.1 | Establish whether the category 404s are a real dead end or a naming mismatch | MET | BOTH, and stated as both. Two taxonomies share one URL space: `/categories/[slug]` binds `hero-categories.ts` (7 slugs), the real taxonomy is `event_categories` (22 slugs, listed) |
| 1a.2 | Then fix it | MET | All 22 driven against the local production build: 308 to `/events?category=<slug>`. The retired `arts-culture` spelling forwards to `arts-community`. A nonsense slug still 404s |
| 1a.3 | Every URL in the sitemap resolves 200 or is not in the sitemap | MET | 730/730 answered 200 against TEST, 0 redirects, 0 errors. The six 308ing category URLs are excluded via the shared redirect table |
| 1b | Sweep EVERY sitemap URL against production, report each, count by outcome | MET | 586 swept: 200 x538, 3xx x0, 404 x48, other x0, error x0. All 48 listed by path |
| 1c | Artist and venue pages: correct (no data) or defect (routes exist, never listed) | MET | Both defects. Venues: the block queried `venues.slug`, a column that does not exist, 42703 swallowed by `catch {}`, 0 URLs published on every build while TEST held 18 venues. Artists: no block at all; flag `broadcast_artists` true on TEST, false on production |
| 1d.1 | Guard it: nothing enters the sitemap that does not resolve | MET | `scripts/guards/sitemap-resolves.mjs`, registered in `run-guards.mjs`, four checks, prints all 31 published shapes |
| 1d.2 | Drill it | MET | 5 drills in `guard-failure-drills.mjs`, all FAIL AS EXPECTED, 50/50 fire |

### TASK 2 - the drift audit

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 2a.1 | `total_event_count`: drive a drift | MET | Event DELETED: 1 -> 1, truth 0. DRIFTS |
| 2a.2 | `total_volume_cents`: drive a drift | MET | Positive control refund 24000 -> 15000 FOLLOWS; order DELETED 15000 -> 15000, truth 0. DRIFTS |
| 2a.3 | `sold_count`: drive a drift | MET | Positive control 3 refunded 8 -> 5 FOLLOWS; 2 tickets DELETED 5 -> 5, truth 3. DRIFTS |
| 2a.4 | `reserved_count`: drive a drift | MET | create 0 -> 4, cancel 4 -> 0, DELETE 4 -> 4 truth 0 DRIFTS. Fixed by migration 20260825000001; re-driven 4 -> 0 FOLLOWS |
| 2b | Everything else of the same shape | MET | `hold_amount_cents` DRIFTS, `event_addons.sold_count` DRIFTS then fixed, `discount_codes.current_uses` DRIFTS, `events.is_free` FOLLOWS (the counter-example), `tickets.scan_count` NOT THE SHAPE with reasoning, `payout_holds.amount_cents` NOT THE SHAPE, `organisations.founding_bonus_months` NOT THE SHAPE. No matviews, no tsvector, no generated columns |
| 2c | Every cache tag, verdict per tag, full list | MET | 12 tags, verdict each: 6 CLEARED, 5 EXEMPT with written reasons, `inventory` was NOTHING CLEARS IT and is now CLEARED |
| 2d.1 | Guard the class | MET | `scripts/guards/maintained-aggregates.mjs`, registered, two checks, prints every tag verdict and every increment found |
| 2d.2 | Drill it | MET | 3 drills, all FAIL AS EXPECTED, 53/53 fire |
| 2.x | Fix what can be fixed | MET | migration 20260825000001 applied to TEST and re-driven; `inventory` tag invalidation with an ordering test; admin organiser counters now count rows |

### TASK 3 - structured data

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 3.1 | Confirm whether performer/validFrom are on this branch and unmerged, or absent from production | MET | Both on this branch, unmerged. `performer` absent from main entirely and MISSING on 4/4 production events. `validFrom` present on main's single-Offer branch only; the AggregateOffer branch has none, and production's 4 remaining events are all single-tier so all 4 carry it by luck |
| 3.2 | Validate every page type against Google's own tooling | MET | 14 page types on production through validator.schema.org, the tool Google's docs point at. The Rich Results Test has no public API, stated |
| 3.3 | Report failures by type with counts | MET | Production: 0 required-property failures, 0 validator errors, 3 pages did not load, 6 with no structured data. Branch: 18 types, 0 failures, 13 with none |

### TASK 4 - Lighthouse

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 4.1 | Fix the cause | MET | 1,200 seat rows serialised into the document as a prop. Perf 0.78 -> 0.85, LCP 4396 -> 4045ms, Speed Index 5531 -> 2656ms, document 571,171 -> 188,996 bytes |
| 4.2 | Make the gate deterministic: audit a fixed representative set | MET | `lighthouse-gate-urls.json`, in version control, verified 200 before auditing, fails by name rather than substituting |
| 4.3 | Do not touch a threshold | MET | `git diff lighthouserc.json` is 1 insertion, 1 deletion, and the only changed line is `_urlNote` |
| 4.4 | If a threshold is genuinely wrong, stop and say so | MET (nothing to report) | No threshold needed changing: the page now clears 0.80 at 0.85 |

### TASK 5 - tax invoices

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 5.1 | ATO primary sources cited | MET | ATO "Tax invoices" quoted verbatim with its 25 August 2025 update date and 25 August 2026 fetch date; ABR ABN format with its worked example |
| 5.2 | Organiser records an ABN | MET | migration 20260825000002 applied to TEST; form on `/dashboard/organisation` with server-side checksum validation |
| 5.3 | Buyer receipts become compliant tax invoices | MET | All seven details plus the buyer identity read out of the delivered HTML |
| 5.4 | A GST report exists | MET | `/dashboard/reports/gst`, loaded as a signed-in organiser |
| 5.5 | Prove it by generating one and reading it back | MET | 23/23 checks, three negative controls |

### TASK 6 - credential rotation

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 6.1 | Tell me exactly where to rotate it | MET | Supabase, Project Settings, Database, Reset database password; added as a row to the rotation matrix |
| 6.2 | What else breaks when I do | MET | Two explicit lists in section 7.3: what does NOT break (verified: nothing in `src/` opens Postgres) and what DOES |
| 6.3 | Confirm `SUPABASE_DB_PASSWORD_SYDNEY` in the main checkout's `.env.local` is updated so every script still resolves | **PARTIAL** | See the adversarial pass. The password has NOT been rotated, so there is nothing to confirm updated. The verification is built and proven against TEST; against production it needs the new value |

### Standing rules

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| S1 | Australian English | MET | -ise/-our throughout; `organiser`, `recognised`, `normalised` |
| S2 | No em-dashes, no en-dashes | MET | Swept: 0 in every file added or changed this session |
| S3 | The community word | MET | No new use of the banned word except the redirect table's retired route names, admitted in `copy-tell-gate.mjs` with a written reason on the precedent of `short-links.ts` |
| S4 | TEST-only writes; production probes read-only | MET | Both migrations applied to TEST only. Every production touch was an HTTP GET or a service-role SELECT. The rotation script opens with `default_transaction_read_only=on` |
| S5 | No trailers, no AI author | MET | `no-ai-authorship` passes; six commits, no trailer |
| S6 | Commit and push after every task | MET | Six commits, six pushes, each before the next task began |
| S7 | Reproduce before fixing | MET | Every fix has a before measurement in its commit message |
| S8 | Negative controls for anything measuring an absence | MET | Guard drills, the tax-invoice receipt cases, the sitemap sweep exit 1 on production, the ordering test, the `no-clock` test |
| S9 | Every guard prints what it scanned | MET | Both new guards print their scan surface and their reviewed exemptions |
| S10 | Never quote evidence captured before the edit | MET | Production sweep re-run with the final tool; drift drive re-run after the migration; Lighthouse re-measured after each attempt |
| S11 | Banned git operations | MET | None used. Only `add`, `commit`, `push` with an explicit refspec, and read-only `status`/`log`/`show`/`diff` |

---

## Phase 3: the adversarial pass

**Silent drops.** One. Requirement 6.3 asks me to CONFIRM the main checkout's
`.env.local` is updated. It is not updated, because the password is not rotated,
and rotating it is the founder's step at a dashboard I cannot reach. The report
must not imply otherwise. Recorded as PARTIAL and carried to `UNFULFILLED`.

**Interpretation drift.** Two admissions.

1. Task 1a says "all 22 real category slugs return 404 ... Then fix it." I fixed
   it with a 308 to the existing canonical browse surface rather than by building
   22 landing pages. That is a narrower reading than "build the pages", and I
   state it plainly rather than let the ledger imply the larger build: there is
   already exactly one canonical category surface, the homepage rail already
   links to it, and inventing 22 pages of editorial nobody wrote is the generic
   risk Law 1 exists to refuse. If the founder wanted 22 landing pages, this is
   the sentence that tells him he has not got them.

2. Task 2 says "fix what can". I did not rewrite `ticket_tiers.sold_count` or
   `discount_codes.current_uses`. Both still drift. Named in the commit, in the
   guard registry, and in the drive's own output rather than left implied.

**Match versus surpass.** The brief named no competitor for these six tasks, so
the surpass test does not apply. No competitor claim is made anywhere in this
session's output.

**Unverifiable claim hunt.** Every quality claim in the report, with what would
falsify it:

- "730/730 resolve 200" - falsified by a non-200 in the sweep; the same script
  exits 1 against production today, which is the negative control.
- "perf 0.78 -> 0.85" - falsified by a Lighthouse run; three runs on three
  different pages, all 0.85 or better.
- "the seat chart still works" - falsified by a blank canvas; driven in a real
  browser, 1394 non-blank sampled pixels, "1200 OF 1200 OPEN", and a
  best-available click returning "Found: 2 together".
- "no threshold was touched" - falsified by the diff; 1 insertion, 1 deletion.
- "nothing in src/ opens Postgres" - falsified by a grep hit; grep returns none.
- "the tax invoice carries all seven details" - falsified by any missing one;
  each read out of the delivered HTML separately.

One claim deleted as untestable: I will not say the Lighthouse gate "now passes",
because the CI run against the Vercel preview had not settled when this was
written. Local measurement is not the gate.

**The generic test.** Not applicable to guards and scripts, but the two new
user-facing surfaces are checked: the tax-invoice panel is specific to this
platform's agency posture (it names EventLinqs as the collection agent, which no
generic invoice component would), and the GST report states the fee exclusion
that follows from this platform's own fee model.

**AI-tell sweep.** Swept every file added or changed: em-dashes 0, en-dashes 0,
exclamation marks in user-facing copy 0, banned community word 0 outside the
admitted redirect table, tell lexicon 0. The `copy-tell-gate` runs over the tree
and passes.

**Regression sweep (DESIGN-LOCK).** Changes to existing surfaces not asked for:

- The order confirmation page's "Tickets purchased" block was REPLACED by the
  tax invoice panel. That is squarely what Task 5 asked for, not a design change
  taken on the side.
- `/events` gained two JSON-LD blocks. Invisible; no layout change.
- The seat chart gained a skeleton before it loads. That is a visible change and
  it is the direct consequence of the fix Task 4 asked for; the skeleton's
  minimum height matches the chart so the settle is zero-shift.
- No hero height, colour, spacing, chrome or copy was touched anywhere else.

**Founder-cost test.** Two checks:

- Does the report send him to a dashboard for something I could have done in
  code? Once, unavoidably: resetting the database password. Everything around it
  is done, including the verification he runs afterwards, so the dashboard step
  is one click and the rest is a command.
- Does it ask a question I could have answered by reading the code? No. The one
  open decision, whether 22 category landing pages are wanted, is stated as a
  decision I made and he can reverse, not as a question blocking anything.

**Evidence-visibility test.** Every deliverable is a runnable command that prints
its own evidence, and each is named in its commit message. Nothing here is
visual: no screenshot deliverable was asked for and none is claimed.

---

## Phase 4: the gate

NOT MET: 0. PARTIAL: 1 (requirement 6.3). Unresolved adversarial findings: 0.

The count is not zero, so the report opens with `UNFULFILLED`.

Finishing 6.3 is not within my reach: it requires the founder to reset the
password in the Supabase dashboard. Everything I can do without that value is
done and proven.
