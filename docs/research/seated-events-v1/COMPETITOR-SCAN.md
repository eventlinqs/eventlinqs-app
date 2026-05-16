# Seated Events: Competitor Scan (Phase 1)

Prepared: 17 May 2026
Scope: public, evidence-labelled scan of how 11 named competitors handle seated/reserved-seating events, to ground the EventLinqs V1 seated-events design on the existing M4 schema.

## Evidence labels

- `[SCRAPED <url>]` - this scan fetched the page directly.
- `[VENDOR-DOC <url>]` - the vendor's own help/feature page (fetched), treated as their stated behaviour, not independently verified in product.
- `[ESTABLISHED-PRACTICE]` - widely documented domain knowledge, no single authoritative source.
- `[INFERRED]` - reasoned conclusion drawn from the above, flagged as such.
- `[ON-FILE]` - prior EventLinqs capture in `docs/research/competitors/` (Phase 1.3/1.4 pricing+UX intel).

## Coverage statement (honest)

What was accessed (publicly, this scan):

- Ticket Tailor: full seating-chart help articles (builder + FAQ). Rich.
- Humanitix: full step-by-step seating-map build guide. Rich (AU-relevant, primary comparable).
- ThunderTix: reserved-seating guide + setup/pricing. Rich.
- SeatLab: full feature page. Medium (marketing language, not a step guide).
- Eventbrite: organiser reserved-seating feature page + help index. Medium (marketing + help titles; deep editor is behind login).
- SeatGeek: public explainer on interactive seat maps. Medium (consumer/resale-marketplace lens, not an organiser builder).
- Seats.io: public "how it works", best-available API docs, accessible-seats docs. Rich - used as the `[ESTABLISHED-PRACTICE]` reference engine (Seats.io is the dominant embeddable seat-map engine; Universe and many others run on it).
- Universe: Seats.io case study (Universe's seat-map capability is Seats.io-powered). Medium.
- Ticketmaster: public consumer help (interactive seat map) + public TM1 business feature page. Medium (organiser editor is enterprise/sales-gated; consumer picker is bot/consent-walled - not directly operable, confirmed by `[ON-FILE]` Phase 1.4).
- DICE: public consumer help (managing seats). Thin (DICE organiser tooling is partner-gated; consumer flow is app-first).

What could NOT be accessed (stated, not faked):

- Paywalled organiser seat-map EDITORS (Ticketmaster TM1 Events editor, AXS, Eventbrite Designer canvas, DICE MIO). Claims about these rest on their own public feature/help copy + `[ESTABLISHED-PRACTICE]` + `[ON-FILE]`, labelled as such.
- Live bot/queue/consent-walled seat pickers (Ticketmaster, AXS) were not driven interactively. Behaviour is from vendor help docs + `[ON-FILE]` Phase 1.4 mobile captures.
- AXS: no public organiser seat-map documentation located; only consumer marketing. Coverage is weak and is stated as such below.
- RecRoom: no genuine seated-ticketing vendor by this name was found. Search returned an unrelated arcade-venue chain ("The Rec Room") and a SeatGeek resale venue listing. Treated as NOT COVERED rather than fabricated. If the brief meant a specific niche tool, the founder should confirm the correct name/URL.

---

## 1. Ticket Tailor

- Seat-picker UX: buyer sees an interactive chart; seats coloured by Category (colour == price). Simple charts for sub-1,000-seat events, sections/floors charts (optionally a 3D view) for larger venues, zones for non-venue layouts. `[VENDOR-DOC https://help.tickettailor.com/en/articles/10883076-getting-started-with-our-seating-chart-tool]`
- Seat-map editor: in-browser builder with explicit tools - Row, Multiple Rows, Rows with Segments (angled rows), Select, Copy/Paste/Duplicate, Mirror (flip horizontally/vertically for balanced charts), Preview (eye icon). Supports tracing off an uploaded venue map image. `[VENDOR-DOC .../10883076]` `[VENDOR-DOC https://help.tickettailor.com/en/articles/10885807-how-to-trace-a-floor-plan-to-create-your-seating-chart]`
- Tier/price visualisation: Categories. Every seat must belong to a Category; Category dictates colour AND price; one Category can carry multiple ticket types (adult/child) at different prices; multiple Categories allowed within a section (split front/rear rows). `[VENDOR-DOC .../10883076]`
- Capacity model: effective sellable = MIN(seating-chart category count, ticket-type quantity). Overselling structurally prevented by the chart. `[VENDOR-DOC https://help.tickettailor.com/en/articles/10214073-seating-chart-faq-s]`
- Label-binding caveat: sold seats are bound to a seat by LABEL. Editing row/seat labels on a live event detaches sold tickets and frees the seat (double-book risk); reverting the label re-attaches. `[VENDOR-DOC .../10214073]`
- Accessibility: not detailed in scraped articles (booths/tables/GA covered; no wheelchair/companion specifics surfaced). `[SCRAPED .../10883076]`
- Scale/performance: vendor states "the overwhelming majority" of seated events work with Simple charts, generally < 1,000 seats; sections charts for > 1,000. No public render-technology or perf numbers. `[VENDOR-DOC .../10883076]` `[INFERRED]` their default target is small-mid venues.
- Mobile: not explicitly documented in scraped pages. `[SCRAPED]` (gap).
- Pricing model for seat maps: a seat reservation is a separate chargeable usage. A paid seated ticket = 2 usages (1 reservation + 1 ticket); a free seated ticket = 1 usage (reservation only). Seat maps are a metered add-on, not free. `[VENDOR-DOC .../10883076]` `[VENDOR-DOC .../10214073]`
- Worth borrowing: (a) Category = colour + price as the single mapping primitive; (b) explicit Mirror/Duplicate editor tools for fast symmetric builds; (c) trace-a-floorplan-image workflow; (d) MIN(chart, tier qty) oversell guard.
- Avoid: charging a per-seat-reservation fee on top of the ticket fee (hostile to EventLinqs' "keep more / free events free" positioning, `[ON-FILE]`); label-as-foreign-key fragility (editing labels orphans paid tickets) - EventLinqs must bind tickets to a stable seat UUID, not a label.

## 2. Humanitix (primary AU comparable)

- Seat-picker UX: buyers choose a seat at checkout; ticket types are "mapped" to seats so a buyer can only sit where their ticket type allows. `[VENDOR-DOC https://help.humanitix.com/en/articles/8905642-complete-guide-how-to-build-a-seating-map]`
- Seat-map editor: drag-drop canvas with 4 element types - Round table, Square table, Rows, Area (GA/standing). Per-element: rotate (drag handle), duplicate, delete; adjust rows count and seats-per-row; edit individual rows; area capacity is a number. Objects (circle/square/line/icon) and free text for bar/exits/toilets/stage. `[VENDOR-DOC .../8905642]`
- Labelling: per-element label patterns - rows start letter (A-Z), seats start number, row-label layout (left/right/both ends), reversible row + seat order; tables: number vs letter labels, start value, rotation direction, prefix. Multi-select tool to override or hide/remove individual seats (hide = visible but unbookable; remove = gone from all views). `[VENDOR-DOC .../8905642]`
- Tier/price visualisation: ticket-type-to-seat MAPPING on a separate "mapping" tab; select a block/table, assign the ticket types valid there; multiple ticket types per seat allowed but each seat sells once. `[VENDOR-DOC .../8905642]`
- Capacity reconciliation: explicit "see issue" warning when ticket-type capacity != mapped seat count; "auto match"/"auto match all" syncs tier capacity to mapped seats. Strong, copyable safeguard. `[VENDOR-DOC .../8905642]`
- Reusable maps: maps built on other events appear as reusable templates; only the LAYOUT copies, ticket mapping must be redone (mapping is event-specific). `[VENDOR-DOC .../8905642]`
- Organiser seat reassignment: a documented "move an attendee to a different seat" flow exists. `[VENDOR-DOC https://help.humanitix.com/en/articles/8914357-how-to-move-an-attendee-to-a-different-seat]`
- Accessibility: not surfaced in the build guide scraped (hide/remove + objects yes; no wheelchair/companion seat type documented in this article). `[SCRAPED .../8905642]` (gap in public docs scanned).
- Scale/performance: no public render-tech or seat-count limits stated. `[SCRAPED]` (gap).
- Mobile: not explicitly documented in scraped guide. `[SCRAPED]` (gap).
- Pricing model: per `[ON-FILE]` Humanitix is 4% + $0.99 (2.5% + $0.50 charities/schools), booking fee on buyer; no separate documented seat-map surcharge surfaced (contrast Ticket Tailor). `[ON-FILE docs/research/competitors/pricing/_ANALYSIS.md]`
- Worth borrowing: (a) 4 element primitives (round table / square table / rows / area) cover the whole AU community-to-mid-venue range cleanly; (b) the ticket-type-to-seat MAPPING tab as the tier mechanism; (c) the capacity-mismatch "see issue" + auto-match guard (directly applicable to EventLinqs' tier/seat reconciliation); (d) layout-as-reusable-template; (e) hide vs remove seat distinction.
- Avoid: nothing strongly negative observed; main risk is that the public docs do not evidence accessibility seat typing or perf, so do not assume Humanitix is the bar there.

## 3. ThunderTix

- Seat-picker UX: buyers select own seats on a venue-shaped chart; whole venue in one view, price tiers shown as colour-coded seats; can buy across tiers in one transaction. `[VENDOR-DOC https://www.thundertix.com/guides/reserved-seating-chart-layouts-for-theaters/]`
- Seat-map editor approach: NOT self-serve drag-drop for the buyer-facing chart. Organiser submits a labelled file/PDF/CAD/penciled chart; ThunderTix's team builds the selectable map. Detailed labelling required (section / row / seat, odd-even, ascending/descending, X for unsold, mark obstructed + wheelchair + companion). Changes after submission may incur charges. `[VENDOR-DOC .../reserved-seating-chart-layouts-for-theaters/]`
- Layouts supported: theatre (orchestra/balcony/box, overhang), table seating, vendor booths, camping/vehicle spots, seating-in-the-round. `[VENDOR-DOC]`
- Tier/price visualisation: tiers = differently-priced venue areas, colour-coded; per-performance price overrides. `[VENDOR-DOC]`
- Accessibility: explicitly ADA-aligned; wheelchair seats are selectable like any seat; hovering an accessible seat shows a wheelchair icon; companion seats called out. Cites ADA ticketing guidance. `[VENDOR-DOC]`
- Scale/performance: pricing tiered by seat count implies scale handled operationally not technically; no render-tech stated. `[INFERRED]`
- Mobile: not documented in scraped guide. `[SCRAPED]` (gap).
- Pricing model: reserved seating is an optional upgrade - one-time setup fee $250 for up to 450 seats; flat $0.55/seat above 450 seats. `[VENDOR-DOC .../reserved-seating-chart-layouts-for-theaters/]`
- Worth borrowing: (a) the labelling discipline checklist (stage/focal point marked, sections labelled, odd/even, ascending/descending, X for dead seats, obstructed + wheelchair + companion flagged) is an excellent organiser-facing data-quality spec; (b) explicit obstructed-view + companion-seat handling.
- Avoid: the human-built-by-vendor model (slow, unscalable, charges for edits) - the opposite of EventLinqs' instant self-serve no-gatekeeping promise (`[ON-FILE]`). EventLinqs must be self-serve drag-drop.

## 4. SeatLab

- Seat-picker UX: interactive seat map with zoom into blocks/areas, exact seat choice; explicit buyer-facing "Best Available" one-click button (vendor markets this as a differentiator and conversion/upsell lever). `[VENDOR-DOC https://seatlab.com/features/]`
- Seat-map editor: not documented on the public feature page (white-label/managed positioning). `[SCRAPED https://seatlab.com/features/]` (gap).
- Tier/price visualisation: multiple ticket prices per seat; single/multi-day/VIP/group; combinable tickets. `[VENDOR-DOC]`
- "Smart Seating": vendor-stated algorithm to prevent single empty seats (orphan-seat avoidance) between bookings; also used for distancing rules. `[VENDOR-DOC]`
- Hold/timeout: seats reserved for a set time during checkout, auto-released on timer expiry (first-come, no checkout race). `[VENDOR-DOC]`
- Accessibility: not specifically documented (mobile-optimised and tested UX claimed generally). `[SCRAPED]` (gap).
- Scale/performance: claims arena/stadium scale, "thousands to millions" of tickets, 99.99% uptime, surge protection - marketing claims, no technical detail. `[VENDOR-DOC]` `[INFERRED]` marketing, treat sceptically.
- Mobile: explicitly "fully responsive and mobile optimised" as a headline feature. `[VENDOR-DOC]`
- Pricing model: white-label, keep 100% of booking fees; "additional costs may apply" for interactive seat mapping. `[VENDOR-DOC]`
- Worth borrowing: (a) buyer-facing one-click Best Available as a first-class CTA (not hidden); (b) explicit checkout hold timer with auto-release; (c) orphan-seat-avoidance as a stated principle.
- Avoid: opaque "additional costs may apply" on the core seat-map feature (mirrors the hedged-pricing weakness flagged `[ON-FILE]`); marketing-grade scale claims with zero substantiation.

## 5. Eventbrite

- Seat-picker UX: clickable, "shoppable" venue maps; system auto-sells best-available reserved seats first by default but layout is customisable; sections (seated or standing) + tables + objects (stage/bar/bathroom/exits) + text. `[VENDOR-DOC https://www.eventbrite.com/organizer/features/reserved-seating/]`
- Seat-map editor: drag-and-drop "Seating Chart Maker"; click section/row/table labels in a template; add tiers; designate sections, rows, tables. Deep editor canvas is behind organiser login (not scraped). `[VENDOR-DOC .../features/reserved-seating/]` `[INFERRED]` editor depth not directly verified.
- Tier/price visualisation: tiers added to sections; charge more for premium areas; "automatically sell the best available reserved seats first". `[VENDOR-DOC]`
- Accessibility: not detailed on the public feature page. `[SCRAPED]` `[ESTABLISHED-PRACTICE]` Eventbrite supports accessible seating in product but it is not evidenced on the scraped page (gap, do not overclaim).
- Scale/performance: positions large/complex events to a sales team ("Hosting a large or complex event? ... tailored plans"); 270M tickets / 4.7M events / 89M users (2024) cited as platform scale, not seat-map perf. `[VENDOR-DOC]` `[ON-FILE]`
- Mobile: Organizer app gives real-time check-in; buyer maps stated to work on mobile generally. `[VENDOR-DOC]`
- Pricing model: no separate seat-map surcharge surfaced on the feature page; standard Eventbrite fee model (effective ~6.6% + $1.79 AU, `[ON-FILE]`). Large/complex routed to sales (a gate). `[VENDOR-DOC]` `[ON-FILE]`
- Worth borrowing: (a) "best available first by default, manual selection optional" as the default-good behaviour; (b) shoppable-map framing (map IS the buy surface); (c) objects + text for venue legibility (stage/bar/exits).
- Avoid: routing complex/large seated events to a sales gate (anti-self-serve, contradicts EventLinqs positioning `[ON-FILE]`); marketing that asserts a great editor without public evidence (do not assume parity).

## 6. SeatGeek (resale-marketplace lens, not an organiser builder)

- Seat-picker UX (consumer): pan/zoom/drill-in to row level; section hover-highlight (others dim); list<->map two-way sync (click map -> list scrolls, and vice versa); event-specific maps that reflect stage config; seat-view photos; amenity overlays (concessions/restrooms/VIP); per-row view comparison; "Deal Score" 1-10 colour markers (green good, red poor) blending price+location+history. `[SCRAPED https://seatgeek.com/blog/understanding-seatgeeks-interactive-seat-maps-features-you-might-be-missing]`
- Seat-map editor: N/A - SeatGeek is a marketplace; maps built in-house per venue, not by organisers. `[SCRAPED]`
- Tier/price visualisation: Deal Score colour + price on hover; listings (resale) not fixed organiser tiers. `[SCRAPED]`
- Accessibility: maps include accessible-seating labels and filters. `[VENDOR-DOC https://seatgeek.com/blog/...]`
- Scale/performance: explicitly states maps built in-house "from scratch", scalable across thousands of venues, "compatibility with technologies like Mapbox, canvas and SVG". This is the clearest public statement that the dominant render stack for big maps is Canvas/SVG (+ Mapbox-style tiling for very large). `[SCRAPED]` (key technical signal).
- Mobile: explicit "mobile-first", full feature parity (zoom, Deal Score, seat views) on mobile, tap-and-buy. `[SCRAPED]`
- Worth borrowing: (a) list<->map two-way sync (excellent for mobile where the map is small); (b) section hover/focus dim-the-rest; (c) seat-view imagery as a conversion lever (deferrable but design the data slot now); (d) the explicit "Canvas/SVG, Mapbox for huge" technical bar.
- Avoid: Deal Score / dynamic-listing framing - EventLinqs prices are organiser-fixed, no surge (`[ON-FILE]` requirement L2); do not import marketplace pricing psychology.

## 7. Universe

- Seat-picker UX / editor: Universe's reserved seating is Seats.io-powered (Universe chose to integrate Seats.io rather than build in-house). Embedded interactive floor plan, real-time availability, no double-booking, mobile-compatible, white-label-embeddable checkout. `[VENDOR-DOC https://medium.com/seatsio-blog/how-seats-io-helped-universe-break-into-the-reserved-seating-market-485f849a9c0]`
- Editor: Seats.io Designer - draw charts from a reference image, no coding; reuse a global repository of existing venue charts (e.g. draw a 20,000-seat stadium, fully numbered/categorised, in hours). `[VENDOR-DOC same]`
- Scale: stated 50 to 50,000 seats range, real-time availability pushed to all viewers, scalable for any volume. `[VENDOR-DOC same]`
- Worth borrowing: the build-vs-buy lesson itself - a mid-size platform deliberately did NOT build seat maps in-house because of build-time and UX risk. Relevant to EventLinqs' V1 build/buy decision (see DESIGN-DECISIONS Q10).
- Avoid: nothing specific; note this is a 2018 case study (dated), treat scale numbers as directional.

## 8. Ticketmaster (organiser editor enterprise-gated; consumer picker consent/bot-walled)

- Consumer seat-picker UX: tap section -> ticket list + prices; hover seat -> price/details; zoom into section; select seats; selection NOT reserved until "Buy Tickets" + security check passes; price slider/dropdown highlights in-range seats (in-range dark blue, out gray); "Lowest Price"/"Best Seats" shortcut beside the map; resale seats marked with pink double-arrow; selected seat green check; accessible seats via Filters -> accessibility icon -> Apply. `[VENDOR-DOC https://help.ticketmaster.com/hc/en-us/articles/9786899270545-What-is-the-interactive-seat-map-and-how-do-I-use-it]`
- Colour semantics (documented): section blue = has matching seats (darker = more), gray = sold out/no match; seat blue = available match, gray = unavailable/no match. `[VENDOR-DOC same]`
- Organiser editor (TM1 Events): public business page claims drag-and-drop custom floor plans + inline editors for all event types; reusable templates (floor plan + pricing + ticket types + offers); visual seat-selection/allocation/holds; accessibility + sightline accounted for; real-time multi-stakeholder collaboration in the seat map; "publish an event in 10 min", "80% time reduced on scaling". Editor itself is sales-gated ("Work With Us"), NOT operable by this scan. `[VENDOR-DOC https://business.ticketmaster.com/solutions/event-creation-management/]` `[ON-FILE]` Phase 1.4 confirms TM is enterprise sales-gated.
- Accessibility: documented consumer filter for accessible seats; obstructed-view explained as a concept (related help article). `[VENDOR-DOC]`
- Scale/performance: enterprise stadium scale; no public render-tech; `[ESTABLISHED-PRACTICE]` Ticketmaster-class maps are SVG/Canvas with section-first drill-down for very large venues.
- Mobile: consumer help describes tap-first map; `[ON-FILE]` Phase 1.4 captured browser-not-supported banner + OneTrust + reCAPTCHA on mobile consumer surfaces (friction).
- Worth borrowing: (a) price-range slider that re-colours matching seats; (b) "selection not held until you pass checkout" honesty; (c) reusable template (floor plan + pricing + tickets) concept; (d) explicit section/seat colour legend.
- Avoid: enterprise sales-gate for any seated capability; mobile consent/bot-wall friction (`[ON-FILE]` requirement L5); "selection not reserved" with no hold can frustrate - EventLinqs already has a `seat_holds`/reservation TTL model that is friendlier.

## 9. AXS (weak coverage - stated honestly)

- No public organiser seat-map editor documentation located. Public site is consumer marketing ("A Fan's Guide to Ticketing": discover events, get seats, transfer, resell). `[SCRAPED https://www.axs.com/uk/features]`
- Third-party industry summary lists AXS (with Ticketmaster) as offering "advanced seat maps and inventory controls for complex seating strategies" - directional only, not authoritative. `[SCRAPED https://gitnux.org/best/event-ticketing-system-software/]` `[INFERRED]`
- Net: AXS is an enterprise/primary-ticketing platform comparable to Ticketmaster in posture (sales-gated organiser tooling, app-led consumer). Treat AXS == "Ticketmaster-class enterprise" for design purposes; do not invent specifics. `[ESTABLISHED-PRACTICE]`

## 10. DICE (organiser tooling partner-gated; consumer app-first)

- Consumer seat UX: per-event, either pick-your-seat before purchase OR best-available auto-assigned at purchase; assigned seat shown in confirmation + app; buyer can change seats via app or a "Change Seats" button in the confirmation email; unreserved (first-come) seating is labelled on the ticket type. `[VENDOR-DOC https://dicefm.zendesk.com/hc/en-gb/articles/25864235958033-Managing-your-seats]`
- Organiser editor: partner-gated, not documented publicly; `[ON-FILE]` Phase 1.4 confirms DICE organiser onboarding is a partner/qualification gate.
- Accessibility / scale / mobile: not documented in the scraped consumer article beyond "app-first". `[SCRAPED]` (gap). `[ON-FILE]` Phase 1.4: DICE is app-install-pressured, gig/club vertical, "no surprises" pricing philosophy.
- Worth borrowing: (a) per-event toggle between buyer-picks-seat and best-available-auto-assign (clean product model); (b) self-service seat CHANGE for the buyer post-purchase via a confirmation-email button (reduces organiser support load).
- Avoid: app-install requirement for seat management (EventLinqs is web-first, WhatsApp-native, `[ON-FILE]` L5/K2); partner-gated organiser tooling.

## 11. Seats.io (reference engine - the `[ESTABLISHED-PRACTICE]` baseline)

Not a competitor to EventLinqs; it is the embeddable seat-map engine many competitors (Universe and 100+ others) run on. Its public docs are the most precise public statement of how reserved seating "should" work, so it anchors the established-practice bar.

- Architecture: design chart in browser Designer (point/click/drag, trace a reference image); an "event" tracks availability per chart and is reusable across performances; embed via a `<div>` + `chart.js` + JS render; backend calls a status API (`/book`, `/hold`) right before payment; availability changes are pushed in real time to every viewer of that event. `[VENDOR-DOC https://support.seats.io/en/articles/2069669-how-does-it-work]`
- Best-available algorithm (documented, copy as the spec): step-ordered - (1) same row, adjacent, no orphans, closest to focal point; (2) same row, adjacent, orphans allowed; (3) N closest to focal point any row, avoid leaving anyone alone; (4) across sections; (5) tables/booths bookable-as-unit; (6) GA areas (always a single GA, never split across GA1+GA2); else 400. Multi-floor: lower floors are "better". Category filter can bypass earlier steps. `tryToPreventOrphanSeats` default true. `accessibleSeats: N` reserves N of the group as wheelchair-accessible. `[VENDOR-DOC https://docs.seats.io/docs/api/best-available/]`
- Accessibility model (documented, copy the data model): seats can be flagged Accessible or Companion individually, OR an Accessible category applied to seats/rows. Response object exposes `isAccessible`, `isCompanionSeat`, `hasLiftUpArmrests`, `isHearingImpaired`, `isSemiAmbulatorySeat`, `hasSignLanguageInterpretation`, `isPlusSize`, `hasRestrictedView`, plus `entrance` and `floor`. This is the richest public accessibility seat taxonomy found. `[VENDOR-DOC https://support.seats.io/en/articles/5431933-accessible-seats]` `[VENDOR-DOC https://docs.seats.io/docs/api/best-available/]`
- Hold model: temporary holds via a `holdToken`; book right before payment; resale-status seats are selectable but not counted "available" for best-available. `[VENDOR-DOC]`
- Worth borrowing (heavily): the entire best-available step ladder; the accessible/companion flags + `accessibleSeats` group parameter; the hold-token-then-book-before-payment ordering; "an event tracks availability, reusable across performances" (mirrors EventLinqs' `seats` materialised per event + reusable `seat_maps`).
- Avoid: nothing - this is the reference. The only caution is that Seats.io is a paid third-party engine; building V1 in-house must consciously decide which of these to replicate vs defer (see FINAL-PROPOSAL).

---

## Cross-competitor synthesis (evidence-weighted)

- Editor: the credible self-serve pattern is browser drag-drop with a small set of primitives - rows/tables/area + objects/text (Humanitix, Eventbrite, Ticket Tailor, Seats.io). The vendor-builds-it model (ThunderTix) is explicitly the anti-pattern for a no-gatekeeping platform. `[VENDOR-DOC x4]`
- Tier mapping: universal pattern is a Category/Tier that carries colour + price, mapped to seats; multiple ticket types can share a category/seat but a seat sells once (Ticket Tailor, Humanitix). EventLinqs already has `seat_map_sections.color` + `seats.ticket_tier_id` + `ticket_tiers.seat_map_section_id` - the primitive exists. `[VENDOR-DOC x2]`
- Buyer UX: 2D pan/zoom for small/mid; section-first drill-down for large (SeatGeek, Ticketmaster); best-available auto-assign as the default-good path with manual selection optional (Eventbrite, DICE, SeatLab, Seats.io). `[VENDOR-DOC x4]`
- Accessibility: only ThunderTix and Seats.io evidence a real accessible/companion seat model publicly; Humanitix/Eventbrite/Ticket Tailor public docs scanned do NOT - so the bar to beat is low and EventLinqs can lead here cheaply. `[SCRAPED]` honest gap.
- Render tech: the one explicit public statement (SeatGeek) says Canvas/SVG, Mapbox-style tiling for the largest. No competitor publishes perf numbers - any EventLinqs perf budget is `[INFERRED]`/`[ESTABLISHED-PRACTICE]`, not benchmarked against a competitor figure.
- Pricing: Ticket Tailor meters seat reservations as extra usage; ThunderTix charges a per-seat setup fee above 450 seats; SeatLab hedges "additional costs"; Humanitix/Eventbrite show no separate seat-map surcharge. EventLinqs' "free events free, one low fee" position argues for NO seat-map surcharge.
