# Production approval block

Branch `feat/launch-kit-moat`. Nothing here has been run against production and
nothing here may be run by an agent. Every item is a founder action.

**Sequence matters.** The founder's own ruling: the pipe must be whole before
the tap opens. Items run in the order below, and item 4 is last for that reason.

---

## Preconditions, all currently unmet

| # | Precondition | State |
|---|---|---|
| P1 | This branch is merged to the launch line | NOT MERGED. Nothing pushed |
| P2 | Migrations 20260808000001 and 20260808000002 applied and green on TEST | NOT RUN. Runbook: `docs/roast/MIGRATION-RUNBOOK-2026-08-08.md` |
| P3 | The newsletter capture is live, so the digest list can grow | Built and proven, NOT DEPLOYED |
| P4 | The waitlist bridge is live, so a signup reaches the audience | Built and proven, NOT DEPLOYED |

---

## 1. Migration 20260808000001, city_primary backfill

```powershell
npx supabase projects list          # LINKED must be gndnldyfudbytbboxesk for PRODUCTION
npx supabase migration list --linked
npx supabase db push --linked
```

**Measure production first, do not assume.** Production is 32 published events
with 5 lacking `city_primary` (measured 8 August 2026), NOT the 330 measured on
TEST. Expected result: 5 repaired or fewer, and any residual is an event whose
locality is genuinely not a city we publish.

**Success criterion:** `node scripts/verify/city-primary-backfill-verify.mjs`,
pointed at production, reports `0 disagree` in section b. That section
re-derives every city claim from the locality the organiser typed and fails on
any row that disagrees, so it does not take the migration's word for it.

## 2. Migration 20260808000002, digest share channel

Same push. Widens a check constraint to accept `digest`, a strict superset, so
no existing row can violate it. Without it the digest still sends and links to
the plain event page: the fallback is deliberate, because a digest that fails
to send is worse than a digest whose clicks are not counted.

## 3. The reach-integrity harness against production

```powershell
node scripts/verify/reach-integrity.mjs --production
```

Read only, enforced by proxy. Exit 1 while anything is severed. The BEFORE
state is committed at `docs/roast/reach-integrity/production-BEFORE.txt` (4
pass, 9 FAIL, 4 empty) so the AFTER can be compared honestly rather than
described.

## 4. broadcast_digest ON, LAST

**This is a behaviour change on a live platform, not a schema change.**
Everything above moves data or code. This one starts sending marketing email to
real people.

Founder ruling 2026-08-08: it should be ON. It is off because flags default to
false and nobody flipped it once the digest was finished. That is an oversight,
not a decision. It is held until P3 and P4 are live so the pipe is whole before
the tap opens.

**Count the audience out loud before flipping it:**

```powershell
node scripts/verify/production-read-only-probe.mjs
```

Section 2 prints the granted consent total. **Today that number is 0**, so
flipping the flag today would send nothing to nobody. That is not a reason to
flip it early; it is the reason to flip it only once the capture surfaces are
live and have collected real addresses.

**The flip, when the audience is real:**

```sql
update public.feature_flags set enabled = true where flag = 'broadcast_digest';
```

Run it the way the constitution requires for any production write: by the
founder, from PowerShell, never the Dashboard SQL editor, never an agent.

**Then watch the first send rather than trusting it.** The cron fires Wednesday
22:00 UTC. Before that Wednesday:

```powershell
# resolves the audience and the events, sends nothing, writes nothing
curl.exe -H "Authorization: Bearer $env:CRON_SECRET" `
  "https://www.eventlinqs.com.au/api/cron/weekly-digest?dry_run=1"

# renders the exact mail one recipient will receive, sends nothing
curl.exe -H "Authorization: Bearer $env:CRON_SECRET" `
  "https://www.eventlinqs.com.au/api/cron/weekly-digest?city=geelong&preview_to=<your address>"

# one real rehearsal send to yourself only, writes no audit row
curl.exe -H "Authorization: Bearer $env:CRON_SECRET" `
  "https://www.eventlinqs.com.au/api/cron/weekly-digest?city=geelong&test_to=<your address>"
```

**Read the rendered mail before the tap opens.** Three defects in it were found
that way and by no other means: a missing time of day, a venue line repeating
the city already in the heading, and a dangling separator in the plain text
part. Tests passed on all three.

---

## What is NOT in this block, and why

**The v1 waitlist signups.** Production has zero waitlist rows, so this is
currently theoretical. If any accumulate before the bridge deploys, their
recorded consent says "Nothing else" and they stay excluded from the digest
until a fresh express opt-in is built and run. That is unbuilt work, not a
migration, and it must not be quietly assumed away.

**The orphaned consent backfill.** Production has zero granted consent rows, so
there is nothing to back-fill and nobody is owed anything. If rows accumulate
before the `city_primary` fix deploys, the query to watch is
`select count(*) from marketing_consents where status='granted' and
city_slug is null`. The harness carries it permanently.

**Three flags off with no recorded decision:** `broadcast_follow`,
`broadcast_artists`, and `broadcast_digest` before the ruling above.
`reach-integrity` FAILS on an UNDECLARED flag, because "off" and "off by
oversight" are indistinguishable from outside and only one of them is a
decision. The first two still need one.
