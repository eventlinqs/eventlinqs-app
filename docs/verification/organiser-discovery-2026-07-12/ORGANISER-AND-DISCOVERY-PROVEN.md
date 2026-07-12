# Organiser and discovery proven

Build: `feat/design-elevation-r2` head `f8802a1`, driven through Playwright on
real Chromium against live staging (`https://eventlinqs-staging.vercel.app`).
Every row has a screenshot and a database row. Zero failures.

Non-negotiables held: TEST database `vkapkibzokmfaxqogypq` only, production
never touched, payment engine unchanged (config and monitoring only), Australian
English, community not culture, no competitor named in customer-facing copy.

## Pass / fail table

| # | Check | Result | Screenshot | Database row / artefact |
|---|---|---|---|---|
| 1 | Cold organiser signup end to end | PASS | `01-signup-filled.png`, `02-dashboard.png` | `organisations` id `9521e546-4d18-45c9-b5e0-3b05e12b916c` "Fresh Org hpzx2d", owner_id `72e9f3f1-c444-49fa-9660-5b20945505d6`, stripe_charges_enabled true |
| 2 | Magic Start from a typed description builds a full draft | PASS | `07-magic-start.png`, `08-magic-draft.png` | `events` id `0ee2dc7d-70f4-44d2-978f-4e0572e2151e` slug `fresh-org-jazz-night-n5rvkk`, status published |
| 3 | Image upload WIDE (2400x900) stores + renders cropped, not broken, card + detail at 1440 and 390 | PASS | `crop-wide-wizard-preview.png`, `img-wide-detail-1440.png`, `img-wide-detail-390.png`, `img-wide-card-1440.png`, `img-wide-card-390.png` | cover file `...-fc46738f.jpg`; broken images 0/0/0/0 |
| 4 | Image upload TALL (1600x2400) stores + renders cropped, not broken, card + detail at 1440 and 390 | PASS | `crop-tall-wizard-preview.png`, `img-tall-detail-1440.png`, `img-tall-detail-390.png`, `img-tall-card-1440.png`, `img-tall-card-390.png` | cover file `...-49c3326a.jpg`; broken images 0/0/0/0 |
| 5 | Image upload LARGE (14MB, 4000x3000) stores + renders cropped, not broken, card + detail at 1440 and 390 | PASS | `crop-large-wizard-preview.png`, `img-large-detail-1440.png`, `img-large-detail-390.png`, `img-large-card-1440.png`, `img-large-card-390.png` | cover file `...-be9e609f.jpg`; broken images 0/0/0/0 |
| 6 | Seat-map build and publish | PASS | `05-seatmap-builder.png`, `06-seatmap-saved.png` | `seats` for event = 24 rows; event has_reserved_seating true |
| 7 | Launch Kit poster PDF valid and its QR scans | PASS | `launchkit.png`, `poster-qr.png` | `launchkit-poster.pdf` 37,258 bytes, header `%PDF`; QR decodes to `/s/fHQ0bhgpoe` which 302-redirects to `/events/fresh-org-jazz-night-n5rvkk` |
| 8 | Share cards present + tracked link registers a click in the reach panel | PASS | `launchkit.png` | tracked link `/s/yMxIr6DeX6`; stranger click counted in reach after reload |
| 9 | Attendee export with consent column | PASS | `attendees.png` | `attendees-export.csv` header: `Name,Email,Ticket type,Order ref,Purchase date,Ticket code,Check-in status,Marketing consent,Unsubscribe link` |
| 10 | Organiser seat reassignment with the email arriving in a real inbox | PASS | `reassign.png`, `reassign-email.png` | `tickets` `e335fc37-...` moved to seat Row A Seat 4, status valid; email arrived in mailinator inbox |
| 11 | Discovery sweep: home, browse, search, city, category load with zero console errors and zero broken images at 1440x900 and 390x844 | PASS | `sweep-{home,browse,search,city,category}-{1440x900,390x844}.png` | `discovery-sweep-results.json`: 0 console errors, 0 broken images across 5 surfaces x 2 viewports |
| 12 | Map component renders on an event page | PASS | `sweep-map-event.png` | Google JS map rendered on the event detail page, 0 console errors, no "maps key" notice. The Maps key is live on staging (not a founder step). |

Supporting attendee purchase (so export + reassign had a real attendee): order
`EL-5BFWBSH6`, status confirmed, free seated ticket `EL-VAUU-BVXR`.

## Image-upload rendering proof (detail)

The wizard renders a live cover preview with two crops: Hero 16:9 and Card 4:5.
Each of the three test images was uploaded, made the cover, saved, and then
loaded fresh (cache-busted) on both the event detail page and the organiser page
card at 1440x900 and 390x844. In every case `img.naturalWidth > 0` for every
image on the page (zero broken) and the cover filled its frame without letterbox
or distortion.

- WIDE 2400x900 landscape: hero crop uses the full width, card crop centre-crops
  to 4:5. Rendered clean at both viewports.
- TALL 1600x2400 portrait: hero crop centre-crops to 16:9, card crop uses most of
  the height. Rendered clean at both viewports.
- LARGE 14MB 4000x3000: accepted, downscaled by the media pipeline, stored, and
  rendered clean at both viewports.

Product guard confirmed (not a defect): a 900px-wide image is correctly refused
as a cover with "That image is too small to be the cover (900px wide). Use one at
least 1200px wide." The tall test was regenerated at 1600x2400 to clear that bar,
after which it became the cover and cropped correctly.

## Discovery sweep detail

| Surface | URL | 1440x900 | 390x844 |
|---|---|---|---|
| Home | `/` | 200, 0 errors, 0 broken (81 imgs) | 200, 0 errors, 0 broken (81 imgs) |
| Browse | `/events` | 200, 0 errors, 0 broken (56 imgs) | 200, 0 errors, 0 broken (254 imgs) |
| Search | `/events?q=jazz` | 200, 0 errors, 0 broken | 200, 0 errors, 0 broken |
| City | `/city/sydney` | 200, 0 errors, 0 broken (71 imgs) | 200, 0 errors, 0 broken (71 imgs) |
| Category | `/categories/networking` | 200, 0 errors, 0 broken | 200, 0 errors, 0 broken |

Note on category routing: `/categories/[slug]` resolves only for the hero
categories (networking resolves 200; owambe, caribbean, gospel etc. 301/308
redirect to their `/community/[slug]` landing, all resolving 200). A guessed slug
like `/categories/music` correctly 404s because it is not a real category. The
orphaned `community-picks-section.tsx` component (which references some
non-resolving `/categories/*` slugs) is not mounted on any live page, so none of
those links are ever rendered to a user: not a live dead link.

## Standing gate note

`jsqr` was installed with `--no-save` purely to decode the poster QR for this
verification; `package.json` is unchanged (confirmed clean).
