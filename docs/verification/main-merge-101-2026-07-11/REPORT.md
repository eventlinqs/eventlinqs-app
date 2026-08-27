# PR #101 merged to main - post-merge verification (2026-07-11)

Founder ruling: merge PR #101 (seated attachment fix + backfill, artist layer
switch-on, performer marketplace) into main; gig_board and artist_showcase stay
OFF. Production database never touched (TEST `vkapkibzokmfaxqogypq` only).
Payment engine unmodified.

## Merge

- `feat/launch-kit` rebased onto `main` (`git rebase --onto main b18a4e8`): the
  10 post-#100 commits replayed clean, zero conflicts, because main `17ffc3f`
  was byte-identical to the branch at `b18a4e8`.
- Two commits added before merge: the surpass_edges resolution (see below) and
  a `database.ts` regeneration (the committed generated section lacked the
  20260711000002 marketplace columns; regenerated per
  `scripts/check-types-drift.sh`, legacy aliases untouched).
- Squash-merged as **PR #101** -> `main` tip **`d187361`**.
  `git diff main 882f92a` (the fully gated PR head) = empty: main is
  byte-identical to the tree every gate ran on.

## Gates on the merged tree

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint .` | 0 errors (37 pre-existing warnings) |
| `vitest` | 706 / 706 passing (86 files) |
| `next build` | clean |
| CI required check: lint / typecheck / build | pass (PR head + main push) |
| CI: test (vitest) | pass (PR head + main push) |
| CI: Lighthouse mobile gate | pass |
| types-drift guard (local, vs TEST) | OK after regeneration |

The CI `types-drift guard` job stays red: its `SUPABASE_ACCESS_TOKEN` repo
secret is expired (`Unauthorized` from `supabase gen types`), which also makes
the main-push CI run read "failure" and auto-skips the post-deploy smoke
workflow. Founder action: rotate the secret. Note: after rotation the guard
compares against PROD by default, so it will report real drift until the launch
migrations (20260709000001 .. 20260711000003) are applied to PROD; against TEST
it is green (proven locally this session).

## surpass_edges resolution (founder ruling item 3)

The flag gates three surfaces: the Fill the room organiser panel, the Know
before you go event card, and the What you keep pricing comparison. All three
are evidenced platform edges (docs/surpass/platform-surpass-audit.md), not
testing scaffolding: **launch features, ON is the correct launch state.**
Recorded in: `src/lib/flags.ts` comment, migration
`20260711000003_surpass_edges_launch_state.sql` (description only, enabled
untouched), and the live TEST `feature_flags.description`.

## Staging

`eventlinqs-staging.vercel.app` -> deployment `eventlinqs-qiena1qyl`
(`dpl_5jsHjBWSZW6J1Q1FiXiamDPXWv7R`, commit `882f92a`, byte-identical to main
`d187361`), carrying the launch-kit branch Preview env (TEST Supabase, TEST
Stripe). This is the same deployment that passed the Lighthouse mobile gate.

## Post-merge smoke (all four green, this directory)

1. **Magic Start -> publish -> Launch Kit**: draft built from a description,
   cover uploaded, published; Launch Kit shown with poster, share links, event
   page link. `regression-magic-draft.png`, `regression-launch-kit.png`.
2. **Seated purchase, user attached**: order **EL-A8FR9MZ8** confirmed, card
   4242, `user_id = 57101100-eec8-4e72-a464-97e11e66bea1` (the logged-in
   buyer), guest fields null, ticket visible in My Tickets.
   `a-loggedin-seated-*.png`.
3. **GA purchase**: order **EL-4G8FNUNP** confirmed, user attached identically.
   `c-loggedin-ga-*.png`. (The harness also re-proved guest-null stage B order
   EL-AZ2Z6S7R and ticket transfer stage D.) `proofs.json`.
4. **Artist-link attribution**: fresh guest through Sienna Vale's tracked link
   `/s/10Ct5Cc6Ud`; conversions 1 -> 2, the new row attributed to the new order
   `d965f7d5-a8af-4b03-afda-bcd63400206c`. `artist-attribution-proof.json`,
   `artist-link-landing.png`, `artist-link-confirmation.png`.

## Flag states on main (queried against TEST feature_flags)

| Flag | State | Note |
|---|---|---|
| launch_kit | ON | launch list |
| magic_start | ON | code default, no DB row |
| seated_events | ON | launch list |
| surpass_edges | ON | resolved: launch feature (this ruling) |
| broadcast_share | ON | Stage 1 |
| broadcast_artists | ON | Stage 3, switched on for launch |
| broadcast_digest | off | post-launch runbook |
| broadcast_follow | off | post-launch runbook |
| gig_board | off | founder ruling: stays OFF |
| artist_showcase | off | founder ruling: stays OFF |
| community_giving | off | awaiting founder settlement approval |

## Nothing half-on faces a user (staging, flags off)

- `/gigs` -> **404** (`gigs-404.png`)
- `/artists` -> **404** (`artists-404.png`)
- `/gigs/some-id` -> 404; `/dashboard/gigs` -> 307 to login (flag-gated
  notFound behind auth)
- Control: `/artists/sienna-vale-x8ge95` -> 200 (broadcast_artists is ON, the
  artist layer is intentionally live)
