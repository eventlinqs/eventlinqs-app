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

## 5. broadcast_follow ON

**This is a behaviour change on a live platform, not a schema change.** No
column moves. What changes is what a signed-in person can see and control.

Founder ruling 2026-08-08, session 3: **ON, and this is the priority.**
"Collecting a follow graph a visitor can neither see nor withdraw is a privacy
defect, not a missing feature."

**What is broken while it stays off**, which is why it is a privacy item and not
a feature request:

- the Follow control on the event page is **UNGATED and already live**, so a
  visitor can follow an organiser today;
- the row **is written** to `saved_organisers`;
- the just-announced cron **does read** it, so those follows already drive mail;
- the "Following" section on `/account/notifications` **is gated**, so the
  person can neither see who they follow nor unfollow from their account.

**What flipping it changes:** `/account/notifications` gains a Following section
listing followed organisers and artists, each with an unfollow control. Nothing
else changes. The follow button is already there.

**Precondition, already met on this branch:** the duplicate Follow control is
removed (commit `6f69ad8`). Before that fix, turning this flag on rendered
**two** Follow buttons for the same organiser in the same card. Measured: 1
control with the flag off, 2 with it on. Do not flip this on a deployment that
does not carry that commit.

```powershell
npx supabase projects list          # LINKED must be gndnldyfudbytbboxesk for PRODUCTION
```

```sql
update public.feature_flags set enabled = true where flag = 'broadcast_follow';
```

**Success criterion:**

```powershell
node scripts/verify/reach-integrity.mjs --production
```

`flags-off-by-oversight` stops naming `broadcast_follow`. Then open
`/account/notifications` as a signed-in user and confirm the Following section
renders and its unfollow control works.

The flag cache TTL is 30 seconds, so the switch lands within that window without
a deploy. The admin flags surface calls `invalidateFeatureFlag` on write; a
direct SQL update does not, so wait the TTL rather than concluding it failed.

## 6. broadcast_artists ON

**This is a behaviour change on a live platform, not a schema change.**

Founder ruling 2026-08-08, session 3: **ON.** "Built, wired across 14 sites
failing closed, proven with attribution splitting. I accept the consequence that
it publishes a public page per tagged performer; that is the point of the lineup
loop."

**What flipping it changes:**

1. Organisers get a Lineup step in event create and edit, and can tag performers.
2. Tagging emails a claim invitation to an artist who has not claimed a profile.
3. `/artists/[slug]` stops being a 404 and becomes a **public page per tagged
   performer**, carrying their name and the events they are on. This is the
   consequence explicitly accepted above.
4. Artists get a dashboard at `/artist/dashboard` and per-artist tracked links.
5. The just-announced cron begins including artist followers.
6. Event pages show a confirmed lineup rail.

Nothing here charges anyone or touches the payment engine.

**The evidence behind the ruling:**
`docs/broadcast/evidence/artist-switch-on-2026-07-11/gate.json`, from
`scripts/verify/artist-layer-gate.mjs` driving the real flows: two artists
tagged, two buyers through two different tracked links, `splitCorrect: true`
across the database, the organiser's "who filled the room" table and the artist
dashboard, plus the artist-variant share card rendering at 200.

```sql
update public.feature_flags set enabled = true where flag = 'broadcast_artists';
```

**Success criterion:** `reach-integrity --production` stops naming
`broadcast_artists`, and one `/artists/[slug]` for a tagged performer returns
200 rather than 404.

**Both of items 5 and 6** run the way the constitution requires for any
production write: by the founder, from PowerShell, never the Dashboard SQL
editor, never an agent.

## 7. Rotate `CRON_SECRET` on production: 28 characters against a 32 minimum

**This is a credential rotation, not a schema change, and it has NO
add-then-revoke window.** `CRON_SECRET` is single-valued: there is exactly one
correct value at a time, and the gap between writing the first store and the
second IS an outage in which every cron route 401s.

**The finding.** The manifest declares `CRON_SECRET` as `^\S{32,}$`, "a
single-token secret of at least 32 characters". Production's value is **28
characters** and fails its own declared shape. This is not an entropy emergency
(28 characters of `openssl` output is still strong) but the manifest and the
reality must agree, and today the platform enforces a rule on everyone that its
own live environment breaks.

The TEST copy had the same class of problem at **4 characters** and is already
fixed on this branch (regenerated to 43). No check was passing because of the
short value: every `CRON_SECRET`-touching check was run before and after and no
verdict changed.

### The sequence. BOTH stores before ANY redeploy.

```powershell
# 1. Generate ONE value and hold it. 48 hex characters, comfortably over the
#    32-character minimum.
$new = -join ((1..24) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
$new.Length          # must print 48

# 2. Write Vercel PRODUCTION. Do NOT redeploy yet.
#    Dashboard: Project -> Settings -> Environment Variables -> CRON_SECRET
#    -> Edit -> paste $new -> Production scope only -> Save.
#    (The CLI cannot set values non-interactively on this account; the
#     dashboard is the supported path.)

# 3. Write the GitHub Actions secret with the SAME value, still no redeploy.
gh secret set CRON_SECRET --body $new

# 4. Confirm both stores hold it BEFORE the redeploy.
gh secret list | Select-String CRON_SECRET      # updated timestamp is today

# 5. NOW redeploy production, so the running deployment picks up the new value.
#    Vercel dashboard -> Deployments -> latest Production -> Redeploy.
```

### The handshake that proves they still match

```powershell
node scripts/check-env-stores.mjs --mode=handshake
```

**Success criterion: HTTP 200.** This is the whole proof and it is why the two
stores holding the same secret is correct by design: CI sends
`Authorization: Bearer $CRON_SECRET` to a production cron route and requires
200. Two different secrets cannot both succeed, so a 200 is byte-equality proven
without either store revealing its value. A 401 means the pair has diverged and
step 5 was reached before step 3 finished.

Then confirm the shape violation is gone:

```powershell
node scripts/verify/payment-critical-doctrine.mjs   # ALL GREEN
```

### Timing

**Do not run this while a cron window is open.** Vercel crons that fire
mid-rotation fail closed and are NOT retried. The schedule is in `vercel.json`;
the weekly digest fires Wednesday 22:00 UTC. Any other time is fine, and the
whole sequence is under two minutes.

### If it goes wrong

Re-run steps 2 and 3 with the same `$new` value, then redeploy again. There is
nothing to roll back to: the old value is not recoverable and is not wanted.
The only failure mode is the two stores disagreeing, and the handshake names it.

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

Nothing further. `broadcast_follow` and `broadcast_artists` were the two flags
with no recorded decision; both are now ruled and appear as items 5 and 6 above.
