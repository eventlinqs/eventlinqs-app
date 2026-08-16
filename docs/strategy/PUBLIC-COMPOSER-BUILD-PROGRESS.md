# Public composer: build progress

Branch `feat/public-composer`, 9 August 2026. Written after each item, per the
brief. This is the running ledger; the delivery report is the final artefact.

Starting point: a prior session on this branch had already built the composer
(commits `d33eecc` to `7eb8378`) and shipped `docs/strategy/PUBLIC-COMPOSER-DELIVERY.md`
naming two UNFULFILLED items. This session verifies that build rather than
trusting it, and closes what was open.

---

## ITEM 1: THE CHILD-SAFETY DEFECT. Re-audited, and TWO MORE LEAKS FOUND.

**The delivery report claimed "Every one of the four surfaces routes through
it". That was not true.** Two further surfaces carried the exact deny-list bug
the fix existed to remove, and both shipped:

| Surface | File | Shape that shipped |
|---|---|---|
| Upcoming shows on the PUBLIC artist profile `/artists/[slug]` | `src/lib/broadcast/artists.ts:124` | `e.visibility !== 'private'` |
| Past credits on the PUBLIC artist profile and `/gigs/[id]` | `src/lib/marketplace/showcase.ts:236` | `e.visibility !== 'private'` |

A deny-list passes **unlisted** straight through. An unlisted sixteenth at a
home address, tagged to a performer, would have rendered on a public,
indexable artist page.

**Why they survived the previous pass.** The guard test named
"nothing in the codebase uses the leaky deny-list shape" was not a sweep. It
read four hand-listed files. A hand-listed guard only ever proves the files
somebody already thought of.

**Root fix, not a patch.** Both call sites now route through
`isPubliclyDiscoverable`, and the guard test now walks the whole of `src/`
recursively, with a meta-assertion that the walk finds more than 300 files so
it cannot silently collapse back to a handful.

**Proof the test is real** (`tests/unit/event-visibility-surfaces.test.ts`):

```
--- REVERTED TO PRE-FIX CODE ---
 Test Files  1 failed (1)
      Tests  2 failed | 10 passed (12)
--- RESTORED ---
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Deny-list sweep over `src` after the fix: four matches, all inside explanatory
comments, zero in code (the test strips comments before matching).

---

## ITEM 2: PERSISTENCE. Moved to Redis, so the ruling holds with NO migration.

**The conflict.** Ruling 0.2c requires a bookmarkable link that lives 30 days
with no account. The brief forbids a migration. The prior session wrote
`supabase/migrations/20260809000001_kit_drafts.sql`, never applied it, and
shipped a store where every persistence function returned `null`.

**Verified rather than assumed** that the table is absent on TEST:

```
kit_drafts HTTP=404
{"code":"PGRST205","message":"Could not find the table 'public.kit_drafts' in the schema cache"}
```

**The resolution.** `src/lib/launch/draft-store.ts` now stores drafts in Redis
under a 30-day TTL, behind the identical public interface. This is the better
design on the merits, not merely the permitted one:

- A draft is inherently ephemeral, so `setex` states the 30-day rule directly.
  **The nightly sweep Phase 0 specified is no longer needed at all.**
- Redis is already a production dependency and is declared in the env manifest.
- Keys are namespaced by Supabase project ref in `redis/client.ts`, so a TEST
  draft can never be read by production.
- Degradation is unchanged: no Redis means no cross-device persistence, the kit
  still renders in full, and nothing throws at a visitor.

The unapplied, unreferenced migration was deleted (`git rm`), because leaving a
migration in the tree that no code reads is a trap for whoever applies it next.

**Proof the round-trip test is real** (`tests/unit/launch-draft-store.test.ts`,
13 tests, fake Redis honouring TTL):

```
--- OLD TABLE-BACKED STORE IN PLACE ---
 Failed Tests 7
 AssertionError: expected null not to be null
--- RESTORED ---
 Tests  13 passed (13)
```

Covered: save/read by code, save/read by token, 30-day expiry proven by
advancing a clock past it, one-link-per-token on re-save, token stored only as
a hash, claim, claim idempotence, refusal to steal another user's draft,
remaining-life preserved on claim, and graceful degradation with no Redis.

---

## ITEM 3: EMAIL-TO-SELF. Built. It was cheap.

The brief said add it if cheap and say so plainly if not. **It is cheap:** one
existing transactional send (`sendEmail`), one field, no new table.

Built as `src/lib/launch/kit-email.ts` plus the `emailKitToSelf` action and a
field on the kit link bar, below the link that already works so it never reads
as a gate.

It is the only unauthenticated action on this surface that costs something
real, so it is the only one that is strict. Three gates: a plausible address, a
**fail-closed** rate limit of 3 per IP per hour (`launch-email`), and an owned
draft read from this browser's cookie token, so it cannot be pointed at
somebody else's kit or used to mail an arbitrary link from our domain.

**Proof the escaping test is real** (`tests/unit/launch-kit-email.test.ts`):

```
--- ESCAPING REMOVED ---
 Tests  2 failed | 12 passed (14)
--- RESTORED ---
 Tests  14 passed (14)
```

---

## ITEM 4: LAW 7 RESEARCH. Sourced, and it corrects Phase 0 twice.

### The token divisor: SOURCED, and Phase 0 was slightly optimistic

Phase 0 used 3.6 characters per token and marked it unsourced. The primary
source is Anthropic's own glossary
(`https://platform.claude.com/docs/en/docs/about-claude/glossary`, fetched
9 August 2026), verbatim:

> "For Claude, a token approximately represents 3.5 English characters, though
> the exact number can vary depending on the language used."

So the sourced divisor is **3.5, not 3.6**, which makes every Phase 0 cost
figure about 2.9 percent LOW. This is now moot for the anonymous path, because
ruling 0.2b removed the model call from it entirely, but it is recorded so the
figure is never re-derived from memory.

`count_tokens` could not be run: there is no `ANTHROPIC_API_KEY` in this tree
(`grep -c ANTHROPIC_API_KEY .env.test` returns 0). The divisor is therefore
sourced, not measured, and that distinction stands.

### Canva event templates: Phase 0's framing was WRONG in our favour

Canva's own event poster page (`canva.com/posters/templates/event/`, fetched
9 August 2026) calls them free, verbatim:

> "Build anticipation and draw in the crowd with our free event poster
> templates that turn your theme and vision into a successful event."

> "our free poster templates are customizable for about any event"

So **Canva does not gate event templates.** What is gated is premium
*elements* used inside a design (`canva.com/help/premium-elements/`):

> "Premium elements will have watermarks (criss-cross patterns) on your design
> until they're purchased."

and the watermarked-draft preview (`canva.com/help/preview-designs-with-premium-elements/`):

> "If you're not yet sure about buying them, you can download a watermarked
> draft first to see how they'll look like in your design."

> "Watermarked drafts aren't available to Canva Pro, Canva Teams, Canva
> Education, and Canva for Nonprofits. They can use premium elements for free."

Printing is separately priced, from "$14.00" on that page. This makes the
creative-ceiling comparison **worse for us than Phase 0 recorded**, and it is
recorded plainly.

### The three Australian ticketing platforms, from their own pages

| Platform | Source, fetched 9 Aug 2026 | Verdict |
|---|---|---|
| **TryBooking** | `learn.trybooking.com/en/articles/41814-marketing-resources-and-buttons` | **Generic branding only.** Verbatim: "You can download buttons and logos from TryBooking's website to use on your website, posters and other advertising materials." Plus embeddable widgets. Nothing event-specific is generated. |
| **Moshtix** | `moshtix.com.au/v2/pages/marketing-artwork-specs` | **The promoter supplies the artwork.** Verbatim: "For all socials: Please supply engaging images or video per each scheduled post." And: "Content must be supplied at least one week prior. If assets are not supplied on time, placements cannot be guaranteed." The page is a list of dimensions the promoter must hit. |
| **Oztix** | `oztix.com.au/venues-organisers/` | **No promotional asset generation described.** The page sells reach and data ("Australia's largest attendee database reaching 25% of the population"), plus campaign tracking and email campaigns. No poster, card or caption generation is named. |

**The honest limit on the Oztix line:** `get.client.oztix.com.au/features/`
failed with an SSL handshake error and could not be read, so the Oztix finding
rests on the public venues-and-organisers page alone. Absence of a claim on one
page is not proof of absence of the feature, and it is not reported as one.

**What this sharpens.** Moshtix is the strongest evidence in the set for the
composer's premise: an Australian ticketing platform whose promotional
"support" is a specification sheet telling the promoter what to go and make
elsewhere, a week in advance. That is precisely the gap the composer fills.

---

## STILL OPEN AT THIS POINT

- Deployed-preview walk of all six arrivals at 390 and 1440.
- Judging a rendered kit as a promoter (the Phase 0 claim never earned).
- Law 2 Phase A competitor capture.
- Remaining gates: full suite, lint against the 48 baseline, production build,
  guards, axe, link-integrity crawl, affordance scan.
- Two roast rounds.
