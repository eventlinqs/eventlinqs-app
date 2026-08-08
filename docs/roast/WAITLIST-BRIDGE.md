# The waitlist bridge

Founder ruling 2, item one. Branch `feat/launch-kit-moat`.
Started 8 August 2026. This file is written as the work happens, not after it.

---

## What was actually broken

The predecessor's G2 finding was that `/waitlist` writes `city_waitlist_signups`
and nothing reads it to send anything. That is true, and it is only the first of
three breaks in the same chain. All three are measured, not assumed.

**Break 1: the audience was orphaned.** The weekly digest read
`marketing_consents`. The waitlist wrote `city_waitlist_signups`. Nothing joined
them, so every waitlist signup was a person we could not contact.

> **CORRECTION, 8 August 2026, after measuring PRODUCTION.** The 91 percent
> figure below is TEST and TEST only. Production, measured directly:
> **32 published events, 27 with a city claim (84 percent), 5 without.**
> TEST carries 362 published events against production's 32 because TEST is
> loaded with old seed data that predates whatever last wrote `city_primary`.
>
> **The root defect in `createEvent` is real and the fix stands: nothing in the
> organiser path has ever written that column, so every event created from here
> would have been unreachable.** But the blast radius on production is 5 events,
> not 330, and the 91 percent figure must not appear in any statement about
> production.
>
> I measured TEST, reported the number, and let it drive the priority
> conversation. That is exactly the failure the reach-integrity harness exists
> to prevent, and it is the reason the harness must take PRODUCTION as its
> authoritative target rather than whichever database is convenient.

**Break 2 (found this session): no organiser-created event could appear in a
digest at all.** The digest selects events by `city_primary`. The organiser
wizard never wrote that column: `createEvent` and `updateEvent` wrote
`venue_city` free text and nothing else. Measured on the TEST database on
8 August 2026:

```
--- events published total ---
count: 362

--- events with city_primary NULL and published ---
count: 330
```

**330 of 362 published events, 91 percent, could never appear in any city
digest**, while carrying a perfectly recognisable `venue_city`. Every one of the
twenty distinct localities in that set maps cleanly onto a canonical city:

```
{ "Geelong": 42, "Brisbane": 31, "Sydney": 55, "Gold Coast": 15, "(null)": 2,
  "Perth": 16, "Darwin": 8, "Ballarat": 7, "Melbourne": 50, "Adelaide": 13,
  "Canberra": 11, "Hobart": 11, "Wollongong": 9, "Newcastle": 9,
  "Sunshine Coast": 9, "Townsville": 7, "Cairns": 7, "Toowoomba": 7,
  "Albury": 7, "Launceston": 7, "Bendigo": 7 }
```

A brand new organiser publishing tonight was guaranteed to land in that 91
percent. Bridging the audience alone would have delivered an email carrying
nothing of theirs.

**Break 3: the digest produced no evidence.** It linked straight to
`/events/<slug>`, so the one channel the platform itself controls was the one
channel the organiser could not see working.

---

## The consent problem, and why it is not a technicality

The v1 waitlist wording, stored verbatim with every existing signup, reads:

> Join the Geelong waitlist: EventLinqs will email you when Geelong opens and,
> if you registered as an organiser, about Founding Organiser invitations.
> **Nothing else**, and one click unsubscribes you.

A weekly digest is something else. Sending it to a v1 signup would breach the
recorded consent, and the founder's instruction is explicit that getting this
wrong is worse than not sending.

So the bridge does NOT simply pipe one table into another:

- **`CONSENT_VERSION` moves to `v2`**, and the wording now names the weekly
  email in the sentence the person reads before pressing the button.
- **`DIGEST_COVERING_CONSENT_VERSIONS = ['v2']`** is the gate. Only versions
  whose recorded wording covers the digest are ever drawn from.
- **The nine existing v1 signups on TEST get nothing.** That is the correct
  outcome, and it is asserted by a test rather than left to good intentions.
  The lawful route to reach them is a fresh express opt-in, carried on the
  city-opening email their v1 consent DOES authorise. That is a separate piece
  of work and it is named in the open items below, not quietly assumed.

---

## What was built

| File | What it does |
|---|---|
| `src/lib/broadcast/digest-audience.ts` | NEW. The pure merge: both consent sources, one suppression list, deduplicated. No database client, so the rules that decide who gets marketing mail are readable and testable without standing a database up |
| `src/lib/broadcast/digest.ts` | `fetchDigestCities` and `fetchDigestRecipients` now read BOTH sources. `fetchDigestEvents` attaches a tracked short link per event |
| `src/lib/waitlist/city-waitlist.ts` | Consent wording v2 naming the weekly email; the version gate |
| `src/lib/consent/record.ts` | `withdrawDigestByAnyToken` and `findDigestUnsubscribeTarget`: one unsubscribe link that works for either token. Dead `withdrawDigestConsentByToken` removed |
| `src/app/unsubscribe/digest/[token]/page.tsx` | Resolves either token; tells a waitlist recipient exactly what stops and what does not |
| `src/lib/cities/resolve.ts` | NEW. `resolveCitySlug`: free-text locality to canonical city slug, exact match only, never a guess |
| `src/app/(dashboard)/dashboard/events/actions.ts` | `city_primary` written on create AND on update, from the typed locality |
| `src/lib/broadcast/share-codes.ts` | New `digest` channel, kept distinct from `email` |
| `.../launch-kit/page.tsx`, `.../reach/page.tsx` | The channel label "Weekly city email" |

### The four rules the audience obeys

1. **Suppression wins.** Any address with a withdrawn `marketing_consents` row
   receives nothing, from either source. One unsubscribe click stops the digest
   whichever list the person arrived on.
2. **Recorded wording binds.** A waitlist row joins the audience only when its
   stored `consent_version` expressly named the weekly email.
3. **Leaving means leaving.** `unsubscribed_at` on the waitlist row, or a
   consent row that is not `granted`, is out.
4. **One person, one email.** Case-insensitive matching, at most one send per
   address per city, and where a person is on both lists the consent row wins
   because its unsubscribe token is the one already in their inbox.

### Why the unsubscribe needed rebuilding

A bridged recipient holds a waitlist token, not a consent token. The old
unsubscribe page looked up `marketing_consents` only, so that person would have
received a marketing email carrying an unsubscribe link that did nothing. That
is the one failure the Spam Act does not forgive. The route now resolves either
token, and a waitlist-token withdrawal records the suppression in
`marketing_consents` carrying the waitlist row's own consent evidence across:
the exact wording, its version, and when it was given. Where a consent row
already exists its recorded evidence is left untouched and only its status
moves, so no earlier grant is ever overwritten.

The waitlist MEMBERSHIP is deliberately kept: they asked to be told when their
city opens, and this click was about the weekly email. The page says so.

---

---

## The proof, end to end, on real data

`node scripts/verify/waitlist-bridge-e2e.mjs http://localhost:3100`, against the
TEST project (`vkapkibzokmfaxqogypq`), driven through the real product: a
browser filling the real form, the real create wizard, the real cron endpoint.
Full transcript in `docs/roast/waitlist-bridge-evidence/RUN.txt`.

```
===== 1. A stranger joins the city waitlist at /waitlist =====
  [PASS] the wording on screen names the weekly email
===== 2. The stored consent is the v2 wording, recorded verbatim =====
  [PASS] the signup reached city_waitlist_signups
  [PASS] consent_version is v2 -> v2
  [PASS] the stored wording is EXACTLY the wording shown on screen
  [PASS] the signup is live
===== 3. An organiser publishes an event in that city, through the wizard =====
  [PASS] the event was published through the wizard
===== 4. The published event carries city_primary (the root fix) =====
  [PASS] the event exists
  [PASS] it is published -> published
  [PASS] city_primary was written by the real create path -> geelong
===== 5. The digest resolves the waitlist signup and carries the event =====
  [PASS] the waitlist signup is a recipient, sourced from the waitlist
         -> ["lawaladams9@gmail.com (consent)","bridge-proof-msjbnn7t@mailinator.com (waitlist)"]
  [PASS] the new event is carried by the digest -> ["Bridge Proof Night MSJBNN7T"]
===== 6. A real digest email goes out with that person the unsubscribe link =====
  [PASS] the send returned 200 -> 200
  [PASS] the email was addressed to the waitlist signup
  [PASS] the text part carries an unsubscribe link the recipient can act on
  [PASS] the sender is identified, as the Spam Act requires
===== 7. A click on a tracked link is attributed back to the event =====
  [PASS] a click on the whatsapp link was recorded -> 0 -> 1
  [FAIL] the click is attributed to the digest channel (needs migration 20260808000002) -> whatsapp
===== 8. Unsubscribe works from the waitlist token, and the next send excludes them =====
  [PASS] the waitlist token opens a working unsubscribe page
  [PASS] the withdrawal is recorded
  [PASS] the withdrawal carries the exact wording the person consented to
  [PASS] their waitlist place is kept, exactly as the page says
  [PASS] the next send excludes them -> ["lawaladams9@gmail.com (consent)"]
===== 9. Clean up, so the proof never reaches a real inbox =====
  [PASS] no proof event is left behind to reach a real subscriber -> 0 left
===== VERDICT: 1 FAILED =====
  FAILED: the click is attributed to the digest channel (needs migration 20260808000002)
```

**22 of 23 assertions pass. The one failure is the migration gate, and it is
the fallback behaving exactly as designed:** the `digest` channel cannot be
minted until 20260808000002 is applied, so the digest linked to the plain event
page and the click was attributed on an existing channel instead. The
attribution mechanism itself is proven working in the same run.

The withdrawal record, read out of the database, shows the audit trail is
truthful rather than merely present:

```json
{
  "email": "bridge-proof-msjbnn7t@mailinator.com",
  "status": "withdrawn",
  "consent_text": "Join the Geelong waitlist: EventLinqs will email you when Geelong opens, send you a weekly email of what is on in Geelong, and, if you registered as an organiser, contact you about Founding Organiser invitations. Nothing else, and one click unsubscribes you.",
  "consent_version": "v2",
  "source": "city-waitlist",
  "granted_at": "2026-08-07T19:10:45.045065+00:00",
  "revoked_at": "2026-08-07T19:11:27.403+00:00"
}
```

---

## Three defects found by READING the output, not by testing

Founder ruling 3, applied to this unit. Every one of these passed its tests.

The harness now dumps the rendered email on every run
(`?preview_to=` on the cron, which renders and sends nothing), so this is
permanent rather than a one-off. What came out first:

```
Wed, 12 Aug: Bridge Proof Night MSJBAVX0 - Geelong - Free entry
```

1. **No time of day.** A what's-on email that does not say when to turn up has
   failed at the one job it has. The event started at 6pm and the line said
   "Wed, 12 Aug". Fixed: `digestDateLabel` carries the time, in the event's own
   timezone, dropping minutes on the hour.
2. **The venue said "Geelong", under a heading reading "This week in
   Geelong".** The event had no venue name, so the label fell back to the
   locality, which the whole email is already about. Fixed: `digestVenueLabel`
   leads with the venue name and adds the locality only when it differs from
   the digest's own city.
3. **My own fix then produced `Bridge Proof Night -  - Free entry`** in the
   plain text part, because that branch joined on an unconditional separator
   while the HTML branch already guarded it. Only visible by reading the text
   again after fixing the first two.

All three are pinned by tests now. The email as it stands:

```
This week in Geelong

Wed 12 Aug, 6pm: Bridge Proof Night MSJBNN7T - Free entry
https://www.eventlinqs.com.au/events/bridge-proof-night-msjbnn7t-0lkzz3

Unsubscribe: https://www.eventlinqs.com.au/unsubscribe/digest/ac6956b9-...
EventLinqs, hello@eventlinqs.com
```

Subject: `This week in Geelong: 1 event worth a look`

---

## Gates

| Gate | State |
|---|---|
| `tsc --noEmit` | Clean |
| `eslint` | 47 warnings, 0 errors (constitution baseline 48, predecessor 47) |
| `npm test` | **1344 passing across 123 files** (predecessor 1302 across 121) |
| End-to-end proof | 22 of 23, the one gap named above |

## State changed on TEST, so it is not a surprise later

- `feature_flags.broadcast_digest` was `false` and is now `true`. The digest
  cannot be proven with the flag off, and off is not the state this feature is
  meant to sit in. Say if you want it back off.
- The proof deletes its own event, waitlist row and consent row on the way out,
  so nothing it created can ride a real Wednesday send.

## Migrations written, NOT applied

Per the constitution, migration files are written and Lawal applies them with
`supabase db push --linked` from PowerShell against TEST. Neither has been run.

- `20260808000001_city_primary_backfill.sql` repairs the 330 rows. One column,
  only where already null, exact case-folded match against `public.cities`
  only, so a suburb or an unlisted town stays null rather than being filed
  under a city the organiser never chose.
- `20260808000002_share_channel_digest.sql` widens the `share_links` channel
  constraint to accept `digest`. A strict superset, so no existing row can
  violate it.

Until 000002 is applied the digest falls back to the plain event page URL, by
design: a digest that fails to send is worse than a digest whose clicks are not
counted.
