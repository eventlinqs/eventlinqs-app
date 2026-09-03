# REVIEW QUEUE FOR LAWAL

One entry per finished item: what a real user can now do, where the evidence is, and
anything you must decide. Newest last. Plain language.

## Needs you (open decisions and credentials)

- **Production catalogue.** The live site has four event pages, two of them payment test
  artefacts. Every city, community and category page resolves but shows almost nothing. The
  only national seeder refuses a production target by design, and this brief makes production
  read only for me. Options, from C:\dev\PRODUCTION-STEPS.md: seed production deliberately
  (needs a decision and a new guarded path), launch thin and let the invitation cards carry the
  rails, or delay go-to-market until real organisers list. Your call.
- **Disk.** About 6.7 GB free on C:. The one big safe win is the Windows Update download cache
  (7.7 GB at C:\Windows\SoftwareDistribution\Download), which needs an admin shell: Settings,
  System, Storage, Temporary files, "Windows Update Clean-up". Downloads holds 15.4 GB of audio
  and Ableton packs; I did not touch them.
- **Production migrations for A2**, when A2 merges: 20260903000001 and 20260903000002 are on
  TEST only. Applying them to production is yours: link to gndnldyfudbytbboxesk, read the ref
  back, then `supabase db push --linked`. The code is written so it does not matter which of
  the code and the schema deploys first: the second migration keeps events.virtual_url inert
  either way.

## A1. Production is live on main, and the log branch no longer builds

**What changed for a real person:** nothing they can see yet, and that is the point. The live
site had been serving the previous release for a day because the production build was refused
by our own environment guard: a secret pasted with a trailing newline. It now serves main, and
every future merge will deploy again. Pushing this log to its branch used to fire a failing
production build each time; it no longer does.

**Evidence:** C:\dev\EVIDENCE\A1\ (the repair run, the smoke statuses, 21 screenshots).

**Decide:** nothing for this item. The secret was replaced with a fresh one; no guest order
link had ever been minted with the old value, so nothing was invalidated.
