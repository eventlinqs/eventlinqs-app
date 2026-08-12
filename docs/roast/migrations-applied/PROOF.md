# Three migrations applied to TEST, and the inclusive-radius audit

Harness check 5 of 5. 8 August 2026, branch `feat/launch-kit-moat`.

Applied under founder ruling of this session: **TEST only, production never
linked**. The production approval block still holds every one of these; applying
to TEST changes nothing about production.

## The linked proof, immediately before the push

```
=== LINKED PROOF (immediately before push) ===
  gndnldyfudbytbboxesk  eventlinqs-sydney     linked=false
  vkapkibzokmfaxqogypq  eventlinqs-test       linked=true
  production linked=false confirmed
```

The CLI's direct connection (`db.<ref>.supabase.co:5432`) times out from this
machine, so the push went through the TEST pooler using `SUPABASE_DB_URL` from
`.env.test`, percent-encoded. The helper refuses any connection string naming
the production ref and scrubs the password from all output:

```
  host : aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
  user : postgres.vkapkibzokmfaxqogypq
  OK: TEST project confirmed, production not present in the connection string
```

Dry run first, which named exactly the three expected migrations and nothing
else.

## The failure on the first push, and what it caught

```
ERROR: invalid reference to FROM-clause entry for table "e" (SQLSTATE 42P10)
At statement: 1
update public.events e
   set suburb_primary = nearest.slug
  from lateral (
        select s.slug
          from public.suburbs s
         where s.city_slug = e.city_primary
```

My SQL was wrong. `UPDATE ... FROM LATERAL` cannot reference the update target
in PostgreSQL. `20260808000001` and `20260808000002` committed; `20260808000003`
did not, and `migration list` confirmed that split cleanly rather than leaving
a half-applied state. Rewritten as a correlated scalar subquery in `SET`, which
can see the target row, and re-pushed.

## Final state

```
  local=20260808000001  remote=20260808000001
  local=20260808000002  remote=20260808000002
  local=20260808000003  remote=20260808000003
```

### Verifier 1: `city-primary-backfill-verify.mjs`

```
--- a. how many published events can reach their own city ---
  published events           : 363
  with a city claim          : 361 (99.4 percent)
  still unclaimed            : 2

--- b. no event filed under a city the organiser never chose ---
  rows carrying a city_primary: 375
  [PASS] every city claim is an exact match on the locality the organiser typed -> 0 disagree

--- c. what was deliberately left unclaimed, by locality ---
     2  (no locality typed)
  [PASS] nothing resolvable was left behind by the backfill

--- d. the share_links channel constraint accepts digest ---
  [PASS] a share_link with channel 'digest' can be written -> ok
  [PASS] the scratch row was cleaned up

===== ALL GREEN =====
```

Matches the runbook's success criterion exactly. The two unclaimed events have
no venue city recorded at all, so leaving them null is correct.

### Verifier 2: `suburb-primary-backfill-verify.mjs`

```
  active districts in public.suburbs : 24
  districts in the repo              : 24
  [PASS] every district exists in both

  published events            : 363
  with a district claim       : 209
  the rule says should have   : 209
  [PASS] every resolvable event carries its claim

  [PASS] all 209 district claim(s) match an independent re-derivation -> 0 disagree
  [PASS] every district claim belongs to the event's own city
  [PASS] 209 event(s) across 11 district(s), each on exactly one page

===== ALL GREEN =====
```

**The SQL produced exactly the 209 the independent JavaScript re-derivation
predicted, and agreed on every individual row.** The two implementations of one
rule do not diverge.

13 districts resolve to no events. Named as a CONTENT GAP, not a pass.

### The harness board on TEST

`city-primary-coverage: 361 of 361 addressable (100.0 percent)`.

All 10 code checks and every data check pass except `flags-off-by-oversight`,
which is a founder decision and is reported separately.

## The audit you asked for: does the inclusive-radius mistake exist elsewhere?

**No. It existed in exactly one place.** Every geographic resolution in `src`:

| Site | What it does | Verdict |
|---|---|---|
| `resolveSuburbSlug` (district assignment) | nearest district, bounded at 12 km | **was the defect, now exclusive** |
| `events_within_distance` RPC, `distance_km` filter | every event within X km of the visitor | **correct as is.** The user asked for everything in a radius; inclusive IS the semantic here |
| `nearestPickerCity` (`location-picker.tsx`) | single nearest city for the detected-location default | already exclusive |
| `radiusDeg` (`city-map.tsx`) | declared and never used | dead prop, not a resolver |

Everything else matching `radius` in `src` is CSS `border-radius`.

One adjacent observation, not the same defect and not fixed here:
`nearestPickerCity` has **no upper bound**, so a visitor far outside Australia is
assigned the nearest Australian city as their detected location. That is a
defensible default for a control the visitor can immediately change, but it is
an unbounded nearest-match and worth a ruling if the platform ever shows the
detected city as a fact rather than a suggestion.

## The exclusivity assertion, hardened so it cannot be weakened later

The end-to-end disjointness check lives in a script, and a script can be edited.
So the guard is now also a **standing gate**: `district-assignment-is-exclusive`
in `reach-integrity`, which runs with every other check and needs no database.

It is structural, not textual. It fails if:

1. `resolveSuburbSlug` stops picking the single nearest district;
2. any of the **three** callers (organiser write path, `/events?suburb=` filter,
   district landing page) stops deciding through it, because a write and a read
   that disagree produce two different answers to one question;
3. either read path reintroduces a bare `<= SUBURB_MATCH_RADIUS_KM` comparison,
   which is the exact shape of the original regression.

**Negative test, because a gate that has never fired is not a gate.** The
regression was injected into `fetchers.ts` and the gate caught it:

```
regression injected: fetchers.ts no longer calls resolveSuburbSlug
[FAIL ] district-assignment-is-exclusive  (code)
         1 of the 3 callers no longer decide the district through resolveSuburbSlug, so the write
         and the read can disagree about which district an event is in

--- restoring ---
[PASS ] district-assignment-is-exclusive  (code)
10 pass, 0 FAIL
```

The restore was verified byte-identical with `git diff --stat` (empty) and tsc
clean, so the negative test left nothing behind.
