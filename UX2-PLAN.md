# UX2 PLAN, prepared 9 September 2026 (session 57) while the UX1 gate ran

Audited against real code and the live site before any edit. This is the plan,
not a claim of work done.

## UX2.1 LEGAL, HIGHEST PRIORITY. One source for the ABN and the entity.

### What is actually there

The ABN `30 837 447 587` is hardcoded in **12 places across 9 files**, in three
different formats, with **two different postal addresses** and **three different
entity phrasings**:

| File | Line | Shape |
|---|---|---|
| `src/app/about/page.tsx` | 225-226 | "Australian sole trader (ABN 30 837 447 587)" |
| `src/app/legal/accessibility/page.tsx` | 139 | split across lines |
| `src/app/legal/cookies/page.tsx` | 41 | "+ PO Box 141, Newcomb VIC 3219" |
| `src/app/legal/organiser-terms/page.tsx` | 64 | "Lawal Adams trading as EventLinqs" |
| `src/app/legal/privacy/page.tsx` | 43-44 | **split across lines** |
| `src/app/legal/terms/page.tsx` | 67-68 | **split across lines** |
| `src/app/press/page.tsx` | 28, 113-114 | one inline, one **split across lines** |
| `src/components/layout/site-footer.tsx` | 319 | bare "ABN 30 837 447 587" |
| `src/lib/email/order-confirmation.ts` | 410, 512 | "Geelong VIC" not the PO Box |
| `src/lib/email/templates/refund-confirmation.ts` | 191 | "Geelong VIC" |

**THE TRAP, and the reason a naive guard fails.** In FOUR files the number is
broken across two source lines (`ABN 30 837\n447 587`). Any line-based grep
misses them, reports a clean tree, and the founder registers the Pty Ltd and
changes nine of thirteen. The guard MUST normalise whitespace across line
boundaries before it matches.

Two postal addresses are live at once: `PO Box 141, Newcomb VIC 3219` on the
legal pages and `Geelong VIC` in both transactional emails. They cannot both be
the registered address on a tax-relevant document.

### The build

- `src/lib/legal/platform-entity.ts`: legal name, trading name, entity type,
  ABN digits, formatted ABN (through the existing `formatAbn`), postal address,
  locality. ONE source. Every one of the 12 sites derives from it.
- Guard `one-platform-entity.mjs`, registered and blocking: fails when an
  ABN-shaped number appears anywhere outside that module, matching on
  WHITESPACE-NORMALISED text so a line-broken literal cannot hide; and fails
  when the module's own ABN does not pass the existing `isValidAbn` checksum.
- `scripts/verify/platform-entity-matches-stripe.mjs`, run on demand and NOT at
  build time: compares the module's ABN and legal name against the live Stripe
  account. It needs a token, and F2.1 is explicit that the build host has none,
  so this is a verification script, never a prebuild guard.

### Reserved for the founder (Law 10 verdict)

- **RESERVED**: confirming the current ABN at abr.business.gov.au. He said he is
  doing it; the number is his to state.
- **RESERVED**: which of the two addresses is the registered one.
- **SCRIPTED**: everything else. Once he names the value, changing it is a
  one-line edit in one file, and the guard proves nothing else carries it.

## UX2.2 The venue pin. Primary source fetched, per Law 7.

Today `createBrandPin` renders a **20px gold dot** whose only label is a `title`
attribute, i.e. a hover tooltip that does not exist on touch. Every surrounding
commercial POI carries a labelled marker with an icon.

**Google, Maps JavaScript API, `CollisionBehavior`**
(https://developers.google.com/maps/documentation/javascript/reference/marker,
fetched 2026-09-09):

- `REQUIRED_AND_HIDES_OPTIONAL`: "Always display the marker regardless of
  collision, and hide any OPTIONAL_AND_HIDES_LOWER_PRIORITY markers or labels
  that would overlap with the marker."
- `OPTIONAL_AND_HIDES_LOWER_PRIORITY`: "Display the marker only if it does not
  overlap with other markers..."
- `REQUIRED`: "Always display the marker regardless of collision. This is the
  default behavior."

The basemap POI labels are the optional class, so `REQUIRED_AND_HIDES_OPTIONAL`
is the published mechanism for "visual weight above the surrounding POIs". That
is the citation, not an inference.

`AdvancedMarkerElementOptions` also publishes `zIndex` (stacking order) and
`gmpClickable` (default **false**) on the same reference page.

### The build
A labelled pin: the venue NAME in a navy/gold plate on the brand dot, one shared
implementation in `src/lib/maps/brand-pin.ts` so all four maps stay identical,
`collisionBehavior: REQUIRED_AND_HIDES_OPTIONAL`, a high `zIndex`, and the name
as real text so it is readable on a phone where there is no hover. Driven at
390, 768 and 1440.

## UX2.3 The rail collides with the footer.

Cause found: `src/app/events/[slug]/page.tsx:977`,
`<section className="bg-canvas pt-12 sm:pt-16">` has **top padding only**. The
two columns close and `<SiteFooter />` follows immediately, so whichever column
is taller abuts the dark footer with zero terminal spacing.

Fix: close the section on the same rhythm it opens
(`ContentSection` uses `py-16 md:py-20 lg:py-24`; this section uses
`pt-12 sm:pt-16`, so the matching bottom is `pb-12 sm:pb-16`). Apply to
`loading.tsx:46` as well, which carries the identical class and would otherwise
shift on hydration. Drive at all three viewports and measure the gap.

## UX2.4 One domain.

**The constraint that decides this, and it is not a preference.**
`src/lib/env/manifest.mjs:204` declares the sender shape as
"an address at eventlinqs.com, **the apex domain verified at Resend**". So
outbound mail is DKIM/SPF-verified for `eventlinqs.com` while the site is served
from `eventlinqs.com.au`.

Public contact addresses are hardcoded literals in **~38 places across 7 local
parts** (hello, careers, organisers, legal, privacy, support, press), none of
them deriving from `sender.ts`, which is the existing one source for the SENDING
identity only. `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` also defaults to `eventlinqs.com`.

### The build
- One source for the public CONTACT identity beside the existing sender source,
  so all ~38 literals derive.
- A guard that the public contact domain and the verified sending domain are the
  same string, so they cannot diverge again.
- The flip to `.com.au` then becomes a one-line change.

### Law 10 verdict on the flip
- **IMPOSSIBLE for an agent**: verifying `eventlinqs.com.au` at Resend requires
  DNS records at the registrar. I hold no registrar or Resend credential, and
  the value does not exist until Resend mints it.
- **RESERVED**: which domain wins is the founder's call.
- **SCRIPTED**: everything on this side of that line, including the guard that
  keeps them together afterwards.

**Do not flip the sending domain before Resend verifies it.** Doing so silently
breaks every ticket email, and `alerts@eventlinqs.com` hard-bouncing on
2026-08-03 is already on the record as what that failure looks like.
