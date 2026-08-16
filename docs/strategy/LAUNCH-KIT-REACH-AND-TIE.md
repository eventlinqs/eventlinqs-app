# Part G: the acute pain, the platform tie, and what is honestly true today

Date: 8 August 2026. Branch `feat/launch-kit-moat`.
INTERNAL DOCUMENT. Competitor names appear as research context only.

Everything below about our own code is verified by opening it. Nothing about
what the platform can do is asserted from a filename or a document.

---

## G2 FIRST, because G1, G3 and G4 all depend on what is actually true

The founder's framing is that we have something Canva, Luma and PosterMyWall do
not: an audience. **That is half true today, and the half that is true is not
the half anyone would guess.**

### The inventory, built versus planned

| Mechanism | State | Who does it actually reach? |
|---|---|---|
| **Weekly city digest** (`weekly-digest` cron, `src/lib/broadcast/digest.ts`) | **BUILT AND SCHEDULED.** Runs Wednesdays 22:00 UTC (`vercel.json:35-36`) | Everyone in `marketing_consents` with `status='granted'` and a `city_slug` matching the event's `city_primary`. **Follower-independent.** A brand new organiser's event appears automatically |
| **Just-announced alerts** (`notify-just-announced` cron, every 15 minutes, `vercel.json:31-32`) | **BUILT AND SCHEDULED** | Only people who follow that organiser (`saved_organisers`). **For a new organiser this is exactly zero people.** Push primary, email fallback, idempotent by a unique (user, event, type) index |
| **City waitlist** (`/waitlist`, writes `city_waitlist_signups`) | **BUILT for capture. DEAD for outbound** | **Nobody.** A repo-wide search for any read of `city_waitlist_signups` that sends anything returns nothing. The digest reads a DIFFERENT table (`marketing_consents`). The national waitlist is a list we cannot currently contact |
| **City pages** (`/city/[slug]`) | **BUILT** | Anyone who browses there. A new published event surfaces by query, no curation needed. **Passive: it reaches people who already came looking** |
| **Community pages** (`/community/[slug]`) | **BUILT**, fed by event tags via the tag bridge | Same as city pages: passive, browse-only |
| **Discovery feed** (`/feed`) | **BUILT** | Signed-in users. Passive |
| **Web push** (`src/lib/notifications/web-push.ts`, `/api/push/subscribe`) | **BUILT** | Only subscribers, and only through the two crons above |
| **Publish-time notification** | **DOES NOT EXIST** | Publishing an event notifies nobody synchronously. Verified: a grep of the publish action (`dashboard/events/actions.ts`) for notify, dispatch, alert, digest or push returns nothing. Reach happens later, on a cron |
| **Repeat-buyer targeting** ("people who bought a similar event in this city before") | **NOT BUILT** | No mechanism reads purchase history to target a new event |

### The honest summary

**One mechanism genuinely puts a new organiser's event in front of strangers on
day one, and it is the weekly city digest.** It is built, scheduled, consent-
compliant and follower-independent. Everything else is either follower-based
(worth zero to a new organiser) or passive (worth something only once people
already browse the site).

**The single highest-leverage defect in the entire brief for the acute pain is
that the waitlist is orphaned.** The founder counts the national waitlist as a
strategic asset. It is a table nothing reads. Bridging `city_waitlist_signups`
into the digest audience, with the consent semantics the Spam Act work already
established, converts a dead list into genuine day-one reach for every
organiser in that city. **It is roughly a day of work and it is worth more to
the acute pain than everything in Parts A to F combined.**

---

## G3: the shortest credible path, and the zero-users problem answered directly

### What this platform can honestly promise an organiser on day one

The founder asked me to address this rather than assume an audience. The honest
answer, stated plainly:

**On day one, with zero users, the platform cannot promise reach. It can
promise three things that are true regardless of audience size, and it must not
imply the fourth.**

True with zero users:
1. **Your event is listed where people look for events in your city**, and it
   appears there the moment you publish, with no curation step and no fee.
2. **Everything you share is measured against real ticket sales.** Every
   artefact carries a tracked link, and the reach panel attributes orders and
   tickets to the channel that produced them. No competitor in ticketing does
   this at the artefact level.
3. **You keep every attendee relationship.** Export, own the list, no walled
   garden.

Not true with zero users, and must never be implied:
4. "We will put your event in front of an audience." Until the digest list in a
   given city has real subscribers, that sentence is false in that city.

**What the first ten organisers get instead of reach: the founder.** That is
not a consolation prize and it should be said out loud in the pitch. Concierge
onboarding, the event built with them, the assets made for them, and the
founder's own network pointed at their first night. The constitution's own
growth doctrine already says recruit the first 25 to 50 personally. The tool
makes that conversation shorter and more impressive; it does not replace it.

### The ranked moves

| # | Move | Works with zero users? | Effort | What it buys |
|---|---|---|---|---|
| 1 | **Bridge the waitlist into the digest audience** | **Yes.** It CREATES the audience | 6 to 10 h | Turns the orphaned national waitlist into real day-one reach. The cheapest genuine answer to the acute pain in this brief |
| 2 | **Waitlist capture on every public surface**, not just `/waitlist` (event pages, city pages, community pages) | **Yes** | 8 to 12 h | Every buyer who lands on any event becomes reachable for the next one. This is how the audience compounds from zero |
| 3 | **A "first event in your city" honest state**, telling the organiser exactly how many people the digest reaches in their city right now | **Yes** | 4 to 6 h | Replaces an implied promise with a real number. Builds the trust that a vague claim destroys |
| 4 | **Buyer-to-buyer share loop already exists**, surface it harder at the confirmation | **Yes.** Every buyer brings the next | 3 to 5 h | The only loop that grows an audience from zero without spend |
| 5 | **Repeat-buyer targeting** ("bought comedy in Geelong before") | **No.** Needs purchase history | 12 to 20 h | Strong, and worth nothing until there are buyers. Build after the first hundred orders |
| 6 | **Publish-time alert instead of a 15-minute cron** | Partly | 3 to 5 h | Makes the delivery moment feel live. Cosmetic until there are followers |

**Moves 1 to 4 total roughly 21 to 33 hours and are the only work in this
entire brief that touches the acute pain.** They should be weighed against A1
and A2, and on impact against effort I would argue they beat both.

---

## G1: the platform tie

**The founder's requirement:** an event built with the tool must be published
on EventLinqs, without rebuilding the wall A1 exists to remove.

**How the reference tools handle the equivalent moment.** Canva lets a free user
download a WATERMARKED draft of a design containing premium elements
specifically so they can see it in context before paying, and the clean file is
what the payment unlocks
([Canva help](https://support.canva.com/publish/download/download-watermarked-draft/)).
The pattern is: full fidelity in preview, restricted in artefact.

**Where I would go past it.** A watermark degrades the thing the user made,
which is why people resent it and search for ways around it. We do not need to
degrade anything, because our artefacts have a property Canva's do not: **they
only FUNCTION when the event is real.** A QR that resolves to nothing, a tracked
link with nothing to track, and a reach panel with nothing to measure are not
crippled versions of the product. They are simply not yet connected to an event.
So the boundary can be honest rather than punitive.

### The boundary

**Before publishing, with no account, a stranger gets:**

- The complete kit rendered, at full fidelity, from their own words. The real
  page, the real poster, the real cards, the real copy. Not a sample, not a
  mockup, not a watermark.
- Every artefact visible full size and legible on screen.
- The honest reach number for their city (move 3 above).

**Publishing unlocks:**

- **Downloadable files.** The A4 poster PDF, the story and square cards.
- **Live tracked links and a scanning QR.** Before publish the QR carries the
  preview URL and is captioned "this goes live the moment you publish", so it
  is never a dead scan and never a lie.
- **The reach panel**, which cannot exist before there is something to measure.

**The copy at the boundary, which is where this is won or lost.** Not "sign up
to download". The honest sentence is that these are the things that need a live
event behind them:

> Your poster needs a live page for its code to open. Publish and it starts
> working. Free for free events.

That is a statement of fact, not a gate. It reads as the next step because it
IS the next step.

**Why this satisfies both requirements.** The stranger sees their real kit before
committing anything, which is A1's entire purpose. The artefacts only leave the
building attached to an event on this platform, which is G1's. Nothing is
degraded, so nothing invites resentment or a workaround.

---

## G4: what the promise should actually be

A4 moved the promise from asset generation to measurement. G2 shows the reach
claim is only true in cities where the digest list has subscribers, which today
is a question rather than a fact.

**So the promise must be conditional on something we control, and it is.**

The honest promise, in the platform's own register, never promising to fill the
room:

> **Build your event, get everything you need to sell it, and see exactly what
> worked.** Your page, your poster, your cards and your tracked links, in
> minutes, free. Every share is measured against real ticket sales, so you know
> which channel filled the room and which did not.

**Why the reach clause is deliberately absent.** "We put it in front of your
city" becomes true per city as the digest list grows, and false everywhere else.
A promise that is true in Geelong and false in Perth is a promise that will be
caught, and this platform's own constitution treats a claim we cannot
substantiate as a consumer-law exposure, not just a credibility one.

**What to say instead, per city, from real data:** the honest state from move 3.
"Your event goes into the Geelong weekly email. 340 people get it." That is
stronger than any claim, because it is a number, and it grows every week that
moves 1 and 2 run.

**When the promise can change.** Once a city's digest list passes a threshold
the founder sets, the reach clause becomes true FOR THAT CITY and can be shown
there. Until then it stays out of the copy entirely.

---

## The consequence for the ranked list

This changes my Phase 0 ordering, and I want to say so plainly rather than
quietly reshuffle.

G3 moves 1 to 4 (21 to 33 hours) address the pain that 52 percent of organisers
name as their biggest problem. A2 (story cards and captions, 30 to 38 hours)
addresses asset production, which no source names as a top-five complaint.

**On impact against effort, the reach work beats the asset work.** I am not
proposing to drop A2, because the scope ruling is that every item ships. I am
proposing that if the founder ever has to choose which lands first, the honest
answer changed once G2 was inventoried, and it is the waitlist bridge.
