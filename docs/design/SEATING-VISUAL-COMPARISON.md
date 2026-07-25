# Seating visual comparison: EventLinqs beside every Australian platform

Date: 2026-07-25. Ours: `docs/design/phase-c-2026-07-25/` (buyer maps at 50,
500 curved, and 2000 seats at 1440 and 390; builder empty, drawn, underlay;
kit preview). Theirs: `docs/design/phase-c-2026-07-25/competitor-refs/`
(downloaded where a public screenshot exists) plus the cited source pages.
Verdicts follow the founder's dimensions: colour, spacing, type, density,
depth, motion. A verdict is only stated where the competitor interface was
actually viewed; anything else is marked NOT VIEWED and sits in the
UNFULFILLED block rather than being guessed.

## What ours looks like (the shared language, from the captures)

White plan field over a navy-derived veil; the navy proscenium with the
gold filament and the stage light falling onto the first rows; editorial
section tones (harbour blue, garnet) with white tabular numerals; gold
selection with the bloom and a soft navy lift; stone-grey recede for
everything unavailable; chip legend; curved rows bowing toward the light;
numerals that step back at 2000 seats so the room reads as architecture.

## Platform verdicts

| Platform | Reference | Verdict, and why |
|---|---|---|
| **Ticketmaster** (buyer map) | `competitor-refs/ticketmaster-buyer-2.png` (viewed) | **Ours is more attractive.** Theirs is the functional benchmark (price slider, legend, minimap) but visually clinical: primary blue and magenta dots on flat white-grey, a grey block for the stage, no depth, system type. Colour: coded, not composed. Depth: none. Ours answers with a designed stage, light, editorial tones and elevation while matching zoom, filter and best-available function. |
| **Eventbrite** (designer + buyer) | `competitor-refs/eventbrite-designer.png`, `eventbrite-buyer.png` (viewed) | **Ours is more attractive.** Theirs is clean and even award-listed, but characterless: pastel pink, gold and lavender circles on white, flat throughout, generic sans. It is exactly the "clean but generic" the research records. Ours carries a brand (navy and gold, the stage light), real depth on selection, and typographic intent (tabular numerals, letterspaced caps). |
| **Sticky Tickets** (builder + buyer) | `competitor-refs/sticky-builder.png` (viewed) | **Ours is more attractive.** Theirs is a dated admin panel: salmon circle seats on a grey engineering grid, a black and yellow chrome, form sidebar, no stage object, no design system. Ours opens on a lit stage with an invitation, draws with editorial colour, and reads as one product with the buyer map. |
| **TryBooking** (creation flow) | `competitor-refs/trybooking-builder.png` (viewed) | **Ours is more attractive.** Their reserved-seating creation is form-first (rows and seats-per-row number fields in a wizard step), corporate-clean but visually inert; the plan editor itself is a utilitarian grid. Ours is a visual room studio with the same numeric precision available in the inspector. |
| **Ticketek** | Help centre diagram only (no builder exists to compare) | **Ours is more attractive by forfeit on the builder** (they have no self-serve builder at all); their buyer map is enterprise-gated to selected venues and the public help imagery is a static section diagram. No like-for-like surface exists to lose to. |
| **Moshtix** | None exists | No reserved seating product and no seat map of any kind (their own help centre: "there are no individual reserved seats"). Nothing to compare; ours wins by existence. |
| **Megatix** | None public | The seating subdomain is a bare login; no public seat interface imagery anywhere. Nothing to compare publicly. |
| **Ticketebo** | None (concierge-built, buyer never sees a map) | Buyers get auto-allocation with no map at all. Ours wins by existence on the buyer surface. |
| **Humanitix** (builder + buyer) | help.humanitix.com article 8893240 (screenshots are expiring signed URLs; NOT VIEWED at capture quality) | **No aesthetic verdict claimed.** The capability comparison lives in the matrix; the visual verdict awaits opening the cited article side by side. Listed in UNFULFILLED rather than guessed. |
| **EventBookings** (builder) | support.eventbookings.com/allocated-seating (Google-CDN images, unstable URLs; NOT VIEWED) | **No aesthetic verdict claimed.** Same treatment as Humanitix. |
| **Oztix** (reserved seating) | assets.oztix.com.au product guide PDF (imagery embedded in the PDF; NOT VIEWED as rendered UI) | **No aesthetic verdict claimed.** Same treatment. |

## The Chanel cut

After the captures, one thing came off the finished buyer map: the
"Unavailable" legend chip. The stone-grey receded seats explain themselves,
and the chip was the least informative element on the screen. The code
carries the cut (`seat-selector.tsx`); the captures in this folder predate
it by minutes and still show the chip.

## Honest capture notes

- The 500-seat element captures include the sticky site header band mid
  frame: an artefact of element screenshots on a tall scroll, not a defect
  of the map.
- `buyer-price-filter-active-1440.png` shows the two proof blocks
  overlapping: the test chart placed the second block without dragging it
  clear. A defect of the test data's placement, not of the product; the
  filter behaviour (band vivid, rest receded, focus ring visible) is
  exactly as designed.
