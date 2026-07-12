# Design safe point - guaranteed return (2026-07-11)

The certified pre-elevation design is preserved and restorable in one
command. This is the founder's guaranteed return point for the design
elevation mission.

| What | Value |
|---|---|
| Tag | `design-baseline-2026-07-11` (annotated, on the remote) |
| Commit | `3389944` - "Seating parity build, persona audit fixes, benchmark matrix (#103)" |
| Staging alias target at tag time | `https://eventlinqs-689uv4jml-lawals-projects-c20c0be8.vercel.app` (deployment `dpl_BWTB4Cjcwoq1NMdEiLpHvWYiQ2Kr`, byte-identical tree to the tagged commit) |

## One-command restore

To put the LIVE STAGING back on the baseline design instantly (no build, no
deploy, reversible in seconds):

    npx vercel alias set https://eventlinqs-689uv4jml-lawals-projects-c20c0be8.vercel.app eventlinqs-staging.vercel.app

To restore the CODE line to the baseline (for a branch or an inspection):

    git checkout design-baseline-2026-07-11

The tag is annotated and pushed; `git ls-remote --tags origin
design-baseline-2026-07-11` confirms it on the remote
(`7e122a6a...` tag object pointing at `3389944`).

Note: the Part 1 hero-tempo change (founder-directed) lands on main AFTER
this tag, so the tag preserves the pre-tempo design exactly as certified.
