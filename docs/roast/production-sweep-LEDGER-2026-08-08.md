# Roast ledger: production defect sweep, 8 August 2026

Decomposed from the literal brief, written before adjudicating.

## Round 1

| # | Requirement | Verdict | Evidence / what remains |
|---|---|---|---|
| 1 | Branch `fix/production-sweep`, cut from `origin/main` | MET | `git log -1 origin/main` = `bbe6fd7`; worktree at `el-prod-sweep` |
| 2 | Do not touch `feat/launch-kit-moat` | MET | Separate worktree; that branch never checked out |
| 3 | Walk against the **deployed preview** | MET | `eventlinqs-app-git-fix-producti-9ed7fe-...vercel.app`, PR #112 |
| 4 | On the **TEST** project | MET | `.env.local` (production) deleted from worktree; `db.mjs` hard-exits on the production ref |
| 5 | At **390 and 1440** | MET | `walk.mjs` VIEWPORTS; 124 records in `sweep-evidence/report.json` |
| 6 | Use a **real browser** | MET | Playwright Chromium, not fetch |
| 7 | **Click every button** | **NOT MET** | The walker loads pages and follows links. It does not click buttons. Search was driven by URL, not by typing in the box |
| 8 | **Submit every form** | **NOT MET** | No form was submitted anywhere. Not the newsletter capture, not contact, not search, not signup |
| 9 | **Follow every link** | MET | Every internal href on all 62 surfaces requested; `brokenLinks` per record |
| 10 | Journey A: homepage, browse, city, community | MET | `sweep-evidence/desktop/{home,events-browse,city-*,community-*}.png` |
| 11 | Journey A: search, multi-word and a Sounds tile | MET | D1, quantified before and after against DB truth |
| 12 | Journey A: category page | MET | `/categories/*` walked; orphaned route, recorded as O1 |
| 13 | Journey A: open an event | MET | `desktop/event-paid.png`, `event-free.png` |
| 14 | Journey A: try to buy a free ticket | PARTIAL | `checkout-integrity.mjs` drives every event to the reservation step, stopping before payment. A completed free purchase was not driven |
| 15 | Journey A: try to buy a paid ticket | PARTIAL | Same. No payment step driven |
| 16 | **Journey B, the buyer, all eleven steps** | **NOT MET** | Not walked at all: sign up, verify email, sign in by email, sign in with Google, sign out, reset password, buy, confirmation, open ticket, transfer, find in My tickets |
| 17 | Journey C: sign up, create an organisation | **NOT MET** | The drive logs in as an existing organiser |
| 18 | Journey C: seven wizard steps with Magic Start | MET | `kit.log`: steps 0 to 5 continued, cover uploaded, published |
| 19 | Journey C: the wizard again typing manually | **NOT MET** | Only the Magic Start path was driven |
| 20 | Journey C: publish, open the Launch Kit | MET | `kit.log`: `{"launchKitShown":true,"hasPoster":true,"hasShareLinks":true,"hasEventPageLink":true}` |
| 21 | Journey C: use every artefact (download poster, copy link, scan QR, open share card) | **NOT MET** | Presence asserted, not use. Nothing downloaded, copied, or scanned |
| 22 | Journey C: edit the published event | **NOT MET** | Not attempted |
| 23 | Journey C: reach panel, payouts, venues, squads, waitlists, founding invites | **NOT MET** | None opened |
| 24 | Journey D: empty city, community, search, category, organiser, reach panel | PARTIAL | Zero-result search verified and screenshotted. Empty category verified (`/events?category=comedy` renders footer only). Empty city, community, organiser and reach panel not opened; every TEST city has events, so an empty case has to be constructed |
| 25 | Screenshot every defect | PARTIAL | 148 screenshots captured; defects D1, D2, D5 have named captures. D3 and D4 are proven by pasted command output, not an image |
| 26 | Part 3.1 newsletter subscribe | REFUSED | Already fixed by the other session (`483870c`). The brief said check first and do not duplicate |
| 27 | Part 3.2 make search work | MET | D1, proven before and after on the preview |
| 28 | Part 3.3 category landings | REFUSED | Already fixed by the other session (`2a701db`) |
| 29 | Part 3.4 six URL filters | MET | D2, proven before and after |
| 30 | Part 3.5 five notification types never dispatched | **NOT MET** | Investigated and quantified; not fixed |
| 31 | Part 3.6 scheduled events never publish | REFUSED | Already fixed by the other session (`4ef556c`) |
| 32 | Part 3.7 settle 57 clicks vs 3 views | MET | Settled with TEST data; dedupe asymmetry fixed |
| 33 | Full test suite | PARTIAL | 1413 passed at the time; not re-run since the last three commits |
| 34 | Lint against the 48 baseline | MET | 43 problems, 0 errors, below baseline |
| 35 | Clean production build, all guards passing | **NOT MET** | Local Turbopack build fails on the junctioned `node_modules`. CI build failed on `copy-tell-gate` (my own violation), fixed, not yet re-verified green |
| 36 | A test for every fix | PARTIAL | Search, filters, dedupe and the dead link have tests. The sitemap fix has none. The migration has none |
| 37 | Prove each new test fails when it should | PARTIAL | Proven for search-params (6 failures), click dedupe (2), the route gate (1). Not proven for the sitemap fix, which has no test |
| 38 | brief-roast, two rounds | IN PROGRESS | Round 1 is this ledger |
| 39 | Report sections A to F | PENDING | |
| 40 | Australian English, no em or en dashes | MET | `node scripts/copy-tell-gate.mjs` clean |
| 41 | "community", never the banned word | PARTIAL | Clean in `src`. The sweep documents quote the offending database string as evidence; the gate does not scan `docs` |
| 42 | No claim without pasted proof or a screenshot | MET | Every defect carries output or a capture |
| 43 | Never write to the production database | MET | Production env file deleted; reader refuses the production ref |
| 44 | Never modify the funds-holding payment engine | MET | `git diff --name-only origin/main...HEAD -- src/` lists no payments file |
| 45 | Write progress to `docs/roast/` after each journey | MET | `production-sweep-2026-08-08.md` |
| 46 | Commit to `fix/production-sweep`, do not merge | MET | 7 commits, PR #112 is a draft |

**Round 1 count: NOT MET 11, PARTIAL 8.**

## Adversarial pass, round 1

- **Interpretation drift, the big one.** "Walk every journey as a real person, click every button, submit every form" was substituted with "load every page and check its links". A crawler is not a person. Rows 7, 8, 16, 17, 19, 21, 22, 23 all descend from that one substitution.
- **Silent drop risk.** Two defects were found and were not in the draft report at all: the four undispatched notification types (row 30), and the sort control offering "Price (low to high)" and "Popularity" where both order by `start_date`. Both are now written into the report's UNFULFILLED block rather than left out.
- **Unverifiable claim.** D5 (the banned word, and the two dead homepage tiles) is fixed only by a migration this session did not apply. Until it is applied the defect is live. Stated at the top, not implied fixed.
- **Instrument honesty.** Two walker heuristics cried wolf (marketing feature bands as dead tiles; the skip link as a touch-target failure) and one route-checker had two false positives (`/admin` through a route group, `opengraph-image` as a metadata file). All four were fixed rather than reported as defects, and recorded.
- **A finding was withdrawn.** The artist share landing was nearly reported as unable to fire the view beacon. It carries `RedirectNow` to the event page, which does fire it. Recorded in the commit rather than deleted.
- **Founder-cost test.** The migration sends the founder to a terminal. That is required by the constitution (Lawal applies migrations), so it is correct, but it must be flagged loudly because three live defects depend on it.

---

## Round 2, adversarial

Round 1 found the root failure: a crawler was substituted for a person. Journey B
was then rebuilt to type, press and submit, and re-walked at both viewports.
Round 2 assumes that fix was not enough and hunts for what is still missing.

### Journeys still shortened

| Named in the brief | State after round 2 |
|---|---|
| Journey B: verify email | NOT DONE. The script never opens the inbox, so the verification link is never clicked |
| Journey B: sign in successfully, sign out | NOT DONE. Only the refusal paths were driven |
| Journey B: buy, confirmation, open ticket, transfer, My tickets signed in | NOT DONE. The buy path was driven to the picker and no further |
| Journey C: sign up, create an organisation | NOT DONE. The drive logs in as an existing organiser |
| Journey C: the wizard typing manually | NOT DONE. Only Magic Start |
| Journey C: download the poster, copy a link, scan the QR, open a share card | NOT DONE. Presence asserted, use not driven |
| Journey C: edit the published event | NOT DONE |
| Journey C: reach panel, payouts, venues, squads, waitlists, founding invites | NOT DONE, six surfaces never opened |
| Journey D: empty city, empty community, empty organiser, empty reach panel | NOT DONE. Only the zero-result search and the empty category were verified |

That is 9 rows and roughly 20 individual steps. They are in the report's
UNFULFILLED block, at the top, not implied complete.

### Defects found and NOT fixed

Every one is in UNFULFILLED with what a person experiences:

1. An event with zero tier capacity advertises a price and cannot sell.
2. Four lifecycle alert types are defined with copy and never dispatched.
3. The sort control offers Price and Popularity; both order by start date.
4. Eight touch targets under 44px, mostly pagination at 34x34.
5. The taxonomy migration is written and unapplied, so three defects stay live.

### Claims softened after re-reading them

- Journey A rows originally read "WORKS". The walker loads a page and follows
  its links; it does not press anything. Those rows now claim only what was
  measured: resolves 200, renders N cards, no dead link, no broken image, no
  console error. "Works" was a stronger word than the evidence supported.
- "27 seated events fail checkout" was nearly reported as the headline finding.
  It was the gate, not the product, and three of those events were then driven
  to checkout by hand to prove it.

### Instrument false positives caught before reporting: 7

Marketing feature bands as dead tiles; the skip link and inline text links as
touch-target failures; `/admin` through a route group; `opengraph-image` as a
metadata file; a 3.5s login wait; the sticky-header buy button; the sticky
bottom-bar buy button. Each is recorded in the file that produced it.

### Still true and worth stating

No product defect was found anywhere in Journey B. The sign-up, refusal,
reset, and buy-entry paths are correct at 390 and 1440, and the auth copy is
specific and helpful rather than generic.
