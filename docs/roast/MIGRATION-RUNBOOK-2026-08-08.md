# Migration runbook: 20260808000001 and 20260808000002 (TEST)

Founder ruling R7. Both approved for TEST. **Neither goes near production in
this pass.** The production approval block is written separately, after TEST is
proven.

Run everything from PowerShell in the repo root.

---

## The baseline, captured before you push

Already run, 8 August 2026, against TEST (`vkapkibzokmfaxqogypq`):

```
--- a. how many published events can reach their own city ---
  published events           : 362
  with a city claim          : 32 (8.8 percent)
  still unclaimed            : 330

--- b. no event filed under a city the organiser never chose ---
  rows carrying a city_primary: 46
  [PASS] every city claim is an exact match on the locality the organiser typed -> 0 disagree

--- c. what was deliberately left unclaimed, by locality ---
    55  Sydney   <-- RESOLVABLE, the backfill should have caught this
    50  Melbourne   <-- RESOLVABLE
    42  Geelong   <-- RESOLVABLE
    31  Brisbane   <-- RESOLVABLE
    16  Perth, 15 Gold Coast, 13 Adelaide, 11 Canberra, 11 Hobart,
     9  Wollongong, 9 Newcastle, 9 Sunshine Coast, 8 Darwin, 7 Ballarat,
     7  Townsville, 7 Cairns, 7 Toowoomba, 7 Albury, 7 Launceston, 7 Bendigo
     2  (no locality typed)
  [FAIL] nothing resolvable was left behind by the backfill

--- d. the share_links channel constraint accepts digest ---
  [FAIL] a share_link with channel 'digest' can be written
         -> violates check constraint "share_links_channel_check"

===== 2 FAILED =====
```

**Both failures are the two migrations, not defects.** They are what flips.

Note `46` rows carry a city_primary while only `32` published ones do: the
other 14 are drafts and past events. The verifier reads both deliberately,
because a wrong city claim on a draft is still a wrong city claim.

---

## Step 1. Confirm you are linked to TEST and not production

```powershell
npx supabase projects list
```

**Success criterion:** the row marked `LINKED` (a bullet in the first column) is
`vkapkibzokmfaxqogypq`. If it shows `gndnldyfudbytbboxesk` that is PRODUCTION.
Stop and relink:

```powershell
npx supabase link --project-ref vkapkibzokmfaxqogypq
```

## Step 2. See exactly what will run, before it runs

```powershell
npx supabase migration list --linked
```

**Success criterion:** `20260808000001` and `20260808000002` appear under Local
with **no** matching Remote entry, and nothing else is pending. If any other
migration is pending, stop and tell me: `db push` applies everything pending,
not just these two.

## Step 3. Push

```powershell
npx supabase db push --linked
```

**Success criterion:** the output names exactly `20260808000001_city_primary_backfill.sql`
and `20260808000002_share_channel_digest.sql`, then `Finished supabase db push.`
with no error. Anything else, stop and paste it to me.

## Step 4. Confirm the database agrees they ran

```powershell
npx supabase migration list --linked
```

**Success criterion:** both now show a Remote timestamp beside the Local one.
This reads `schema_migrations` directly, not the PostgREST cache, which lags.

## Step 5. Prove the repair

```powershell
node scripts/verify/city-primary-backfill-verify.mjs
```

**Success criterion, exactly:**

```
  published events           : 362
  with a city claim          : 360 (99.4 percent)
  still unclaimed            : 2

  [PASS] every city claim is an exact match on the locality the organiser typed -> 0 disagree

--- c. what was deliberately left unclaimed, by locality ---
     2  (no locality typed)
  [PASS] nothing resolvable was left behind by the backfill

  [PASS] a share_link with channel 'digest' can be written -> ok
  [PASS] the scratch row was cleaned up

===== ALL GREEN =====
```

Exit code 0.

### How to read the two questions you asked

**"Were the 330 rows repaired?"** Section a. `still unclaimed` must fall from
330 to **2**, and section c must list only `(no locality typed)`. Those two
events genuinely have no venue city recorded, so leaving them null is correct:
inventing a city for them is the failure mode, not the fix.

**"Was any suburb filed under a city the organiser never chose?"** Section b.
It does not trust the migration. It re-reads every row that carries a
`city_primary`, re-derives what that value SHOULD be from the locality the
organiser typed, using the same case-folded exact match, and fails on any row
that disagrees, printing the slug and both values. `0 disagree` is the proof.

The rule that makes this safe is that the match is exact and never fuzzy:
"North Melbourne" does not become `melbourne`, "Torquay" does not become
`geelong`, and both stay null. There is a test for each of those
(`tests/unit/events/city-primary-resolve.test.ts`).

## Step 6. Re-prove the whole chain, now with attribution

The end-to-end proof had one gap, and step 3 closes it.

```powershell
$env:NODE_ENV=""
npx next dev -p 3100
```

In a second window:

```powershell
node scripts/verify/waitlist-bridge-e2e.mjs http://localhost:3100
```

**Success criterion:** `===== VERDICT: ALL GREEN =====`, with step 7 now
reading `a click on the digest link was recorded` and
`the click is attributed to the digest channel`.

Dev rather than `next start` on purpose: the login rate-limit policy fails
CLOSED under `NODE_ENV=production`, and there is no Upstash configuration
locally, so a production server refuses the sign-in the proof needs.

The harness deletes its own event, waitlist row and consent row on the way out,
so nothing it creates can ride a real Wednesday send.

---

## Rollback, if step 5 disagrees with the criterion above

Neither migration destroys anything, so rollback is narrow.

`20260808000002` widened a check constraint. To put it back:

```sql
alter table public.share_links drop constraint if exists share_links_channel_check;
alter table public.share_links add constraint share_links_channel_check check (channel in (
  'instagram','facebook','linkedin','x','whatsapp','messenger',
  'email','sms','copy','native','qr','other'));
```

Any `digest` row already written would block that, and would have to be deleted
first. That is a signal to talk to me, not to force it.

`20260808000001` only filled nulls. Returning those rows to null would restore
the defect, so the correct response to a surprise is to read section b's
disagreement list and fix the rule, not to revert. Tell me what it printed.

---

## Production: NOT YET, and what it will need

Nothing here goes to production in this pass. When TEST is green the production
block will carry, at minimum:

1. Both migrations, unchanged, with the production row counts measured first
   (production may have a very different null-`city_primary` picture, and the
   number goes in the block rather than being assumed).
2. **`feature_flags.broadcast_digest`, which is a real behaviour change on a
   live platform, not a schema change.** Turning it on in production starts
   sending weekly marketing mail to every consenting address. It needs its own
   decision, its own first-send audience count read out loud before the switch,
   and a first send you watch. R8 keeps it ON for TEST; production is a separate
   yes.
3. The v1 waitlist signups question. Production's waitlist rows are on v1
   wording that does not cover the digest, so they stay excluded until a fresh
   opt-in is built and run. That is unbuilt work, not a migration.
