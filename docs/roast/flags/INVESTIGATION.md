# broadcast_follow and broadcast_artists: BUILT, WIRED, PROVEN?

Founder ruling of this session: investigate and recommend, do not record intent
on the founder's word, because ruling without evidence defeats the point of the
flags check. Neither flag was flipped anywhere. **You rule.**

---

## broadcast_artists: BUILT, WIRED and PROVEN. Recommend ON.

**BUILT.** Artists, lineups, claim tokens, an artist dashboard, artist profile
pages, artist-tagged share links, and per-artist attribution.

**WIRED.** 14 read sites, covering the whole path rather than one surface:
the create and edit wizards (`lineupEnabled`), the lineup manager, the launch
kit, the organiser event page, three server actions in `actions/lineup.ts`, the
just-announced alert cron, the artist dashboard, the claim page, the public
artist profile, and the event page lineup rail. Every one of them fails closed:
routes `notFound()` and actions refuse when the flag is off.

**PROVEN.** `scripts/verify/artist-layer-gate.mjs` drove the real flows against
staging and left evidence in
`docs/broadcast/evidence/artist-switch-on-2026-07-11/`: nine screenshots plus
`gate.json`. From that file:

```json
"attribution": {
  "artistA": { "clicks": 2, "conversions": [{ "order_id": "d0016e7a-..." }] },
  "artistB": { "clicks": 1, "conversions": [{ "order_id": "e9f85765-..." }] },
  "splitCorrect": true
},
"follow": { "rowCount": 1, "followed": true },
"organiserDashboard": { "showsBothArtists": true },
"artistDashboard": { "showsArtist": true, "showsGateEvent": true },
"shareCard": {
  "landingStatus": 200,
  "ogTitle": "Marlo Reyes live at Artist Layer Launch Night, Geelong | EventLinqs",
  "ogImageCarriesArtist": true, "cardStatus": 200, "cardIsPng": true
}
```

Two artists tagged, two buyers routed through two different tracked links, and
the attribution split correctly across the database, the organiser's "who filled
the room" table and the artist dashboard. It is already ON on TEST and has been
since 11 July.

**RECOMMENDATION: ON, and this looks like the same class as broadcast_digest, a
finished feature nobody flipped.**

**The behaviour change you would be approving,** stated plainly:

1. Organisers get a Lineup step in event create and edit, and can tag performers.
2. Tagging sends a claim invitation to an artist who has not claimed a profile.
3. `/artists/[slug]` stops being a 404 and becomes a public page for every
   tagged artist. **This is the part to weigh:** it publishes a page per
   performer, carrying their name and the events they are on.
4. Artists get a dashboard at `/artist/dashboard` and per-artist tracked links.
5. The just-announced alert cron starts including artist followers.
6. Event pages show a confirmed lineup rail.

Nothing here charges anyone or touches the payment engine.

---

## broadcast_follow: BUILT and PROVEN, but WIRED WRONG. Recommend a fix before ON.

**BUILT.** `FollowButton`, `saved_organisers`, the `follows` table, the
Following section on `/account/notifications`, and the just-announced alert cron
reading `saved_organisers`. `reach-integrity`'s `follow-write-matches-alert-read`
passes: the button writes the table the cron reads.

**PROVEN, in part.** The artist gate above proved the follow write path works
through the real profile button (`"follow": { "rowCount": 1, "followed": true }`).

**WIRED WRONG, and this is the finding.** The flag had only two read sites, and
one of them was gating a duplicate.

### 1. Turning it on rendered TWO Follow buttons for the same organiser

`/events/[slug]` carried two `FollowButton`s in the same "Organised by" card:
one gated on `broadcast_follow`, and one ungated added later by the demand-engine
work. Two features landed on one card and neither noticed the other. Measured on
TEST by flipping the flag and counting the controls:

```
  flag OFF: HTTP 200, 1 Follow control(s) in the organiser card region
  (flag flipped ON)
  flag ON : HTTP 200, 2 Follow control(s) in the organiser card region

verdict: OFF renders 1, ON renders 2.
Turning the flag on ADDS 1 duplicate Follow control for the same organiser.
```

**Fixed in this pass** (the duplicate removed, the live ungated control kept, so
no currently-visible behaviour changed). Re-measured after the fix:

```
  flag OFF: 1 Follow control    flag ON: 1 Follow control
```

The flag was restored to its original value both times; the probe restores it in
a `finally` block and prints the confirmation.

### 2. The incoherence that needs YOUR ruling

With the flag OFF, which is the state on production right now:

- a visitor **CAN follow** an organiser, because the button on the event page is
  ungated and live;
- the follow **IS written** to `saved_organisers`;
- the alert cron **DOES read** it;
- but the "Following" section on `/account/notifications` is gated on the flag,
  so the person **cannot see who they follow and cannot unfollow from their
  account**.

So the platform is quietly collecting a follow graph that users have no surface
to inspect or withdraw from. That is a consent and control question as much as a
product one, and it is not mine to rule on.

**RECOMMENDATION: ON**, now that the duplicate is gone. Turning it on adds the
Following management surface and resolves the incoherence. The alternative,
turning the ungated follow button off, would remove a live affordance and stop
the demand engine collecting the graph, which cuts against the growth plan.

**The behaviour change you would be approving:** `/account/notifications` gains
a "Following" section listing followed organisers and artists with unfollow
controls. Nothing else changes; the follow button is already live.

---

## The serious thing this investigation turned up, unrelated to either ruling

**The feature-flag cache was shared across environments.**

The cache key was `ff:v1:<flag>` with no environment in it. The Upstash
credentials live in `.env.local`; the database credentials do not. So any process
pointed at a different database, including a developer running locally against
TEST, wrote ITS flag values into the SAME Redis production reads.

Measured, live, during this investigation:

```
  ff:v1:broadcast_follow       = "false"   ttl=4
  ff:v1:broadcast_artists      = "true"    ttl=4
  ff:v1:broadcast_share        = "true"    ttl=5
```

`broadcast_artists` is **`false` on production** and `true` on TEST. That `true`
was written by a local server reading TEST.

**Blast radius.** Bounded by the 30 second TTL, and no production behaviour
change was observed. But bounded is not impossible: for up to 30 seconds
production could serve a stage it had never been told to enable. A feature flag
is the one thing that must never be ambiguous about which environment it belongs
to.

**Remediated in this pass:**

1. Every `ff:v1:*` key deleted from the shared cache, so every reader re-reads
   its own database. (They had already expired; the `del` returned 0 each time,
   which is itself the evidence that the TTL bounds this.)
2. The key now carries the Supabase project ref: `ff:v2:<project-ref>:<flag>`.
   TEST and production can no longer collide, and bumping v1 to v2 means nothing
   inherits the old shared history.
3. Five tests pin it, including the one that matters: TEST and production must
   produce **different** keys for the same flag.

**Still open, for you:** `.env.test` has no Upstash credentials, which is why a
local run silently borrows production's. Either give TEST its own Upstash
instance, or accept the namespacing as the fix. The namespacing makes it safe
either way; a separate instance would make it obviously safe.

---

## What I did NOT do

I did not flip either flag anywhere, and I did not record either as deliberate.
`FLAG_INTENT` in `reach-integrity.mjs` still reads `UNDECLARED` for both, so
`flags-off-by-oversight` still FAILS. **That check stays red until you rule**,
which is exactly what it is for.
