# Homepage benchmark: general-breadth correction vs Ticketmaster

Date: 6 June 2026
Branch: feat/home-rebuild
Captures: 1440 and 390, full page, this directory.
Density source: HOMEPAGE_SEED_FIXTURE catalogue (55 events, 9 general categories,
Sydney / Melbourne / Brisbane). Prod and the Vercel preview render real data
untouched; staging is not yet provisioned, so the full-density proof is local.

## What the correction required

EventLinqs is a complete general ticketing platform first. General category
breadth must LEAD the page. Community is one curated thread, roughly 10 to 20
percent, placed mid-page, never the lead. Strip the community rail out and the
page must still stand as a full Ticketmaster rival.

## Structure shipped (top to bottom)

Hero (single featured event) -> category chip strip -> This Week -> Music ->
Food and drink -> Trending now -> Festivals -> Arts and theatre -> Nightlife ->
Comedy -> Free events -> **Scenes and Sounds (the one community thread)** ->
Sport -> Family -> Business and networking -> Browse by City -> Fresh on the
platform -> Hand-picked for the week -> Featured venues -> footer.

The community rail sits at position 9 of 17 content rails (about 6 percent of
the rails, one premium thread). Eight general category and time rails lead it.
Remove it and the page is unbroken general ticketing. The strip-community test
holds.

## Dimension-by-dimension vs Ticketmaster.com.au

| Dimension | Verdict | Note |
|---|---|---|
| Information density | Surpass | 17 rails of general breadth plus a city rail and venue rail. Ticketmaster leads hero -> featured -> trending -> popular tickets -> discover bento -> popular cities. We carry more granular category rails at both 1440 and 390. |
| Structural logic | Parity | Both lead with general breadth and clean horizontal rails. We mirror the Popular Cities pattern with Browse by City and a See all cities link. |
| Typography | Parity | CAPS rail headings, eyebrow plus title, navy and gold on a light field, faint dividers between rails. Quiet, not shouty. |
| Filter UX | Parity or better | Category chip strip directly under the hero; every rail has a View all into the filtered /events query. |
| Mobile polish (390) | Parity | Clean vertical stack, horizontal scroll rails, 44px controls, no layout breakage. |
| Image quality | Below, known and accepted | Cards render the branded placeholder because cover imagery is null until the Adobe Stock library lands. Ticketmaster uses real event photography. This is the agreed current-fallbacks state and is the next input to this same seed script. |

## Gates

- typecheck: 0 errors
- lint: 0 errors (30 pre-existing warnings, unrelated files)
- production build: pass
- vitest: 30 files, 275 tests pass
- axe-core (WCAG 2.2 AA): 0 violations
- Lighthouse: to run on the Vercel preview (performance, not density); the
  preview renders real prod data until staging credentials land.

## The one honest gap

Photography. Every other dimension is parity or surpass. The branded
placeholders are the accepted interim per the build plan, and the same
seed-events-catalogue script is re-run with real cover URLs once the Adobe
Stock library is wired, with no structural change to the page.
