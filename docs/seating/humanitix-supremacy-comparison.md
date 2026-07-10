# Reserved seating: supremacy comparison (2026-07-10, final)

Feature-by-feature comparison of EventLinqs reserved seating against the
founder-chosen reference standard (Humanitix), studied strictly as a user via
their public help documentation (concepts and experience only; no competitor
code or assets inspected). This document is internal; no competitor is named
on any customer-facing surface.

**Result: zero BEHIND.** Every row is EQUAL or BETTER. The three rows that were
BEHIND in the interim pass were closed on 2026-07-10 (per-seat notes, buyer
self-service seat change, and the section tier-mapping capacity check); see the
former-remainders section at the foot.

Reference sources: their complete seating-map builder guide (help article
8905642), the seating-map quick guide (8893240), moving an attendee (8914357),
galas and tables (8906272), packaged tickets (8893185), comp tickets (8896967).
Our evidence: file paths on `feat/launch-kit`, unit tests, and the end-to-end
proof set in `docs/seating/evidence-2026-07-10/`.

Verdicts: BETTER / EQUAL / BEHIND, judged on what an organiser or buyer can
actually accomplish.

## 1. The organiser builder

| Capability | Reference standard | EventLinqs | Verdict | Our evidence |
|---|---|---|---|---|
| Room shapes / layout freedom | Free canvas: rows, round and square tables, areas, drag + rotate | Free canvas: rows, round and square tables, standing zones, drag + rotate + curve depth | EQUAL | `seat-map-builder.tsx` toolbar + drag (`onBlockPointerDown`); E2E build proof |
| Scenery / room annotations | Shapes, lines, icons, text for stage, bar, exits | Scenery-style areas (bar, exits, mixer) rendered distinctly on builder, buyer map and kit preview; plus the always-on STAGE band | EQUAL | `generate.ts` AreaBlock.style, `seat-map-builder.tsx` AreaConfig Type select, `seat-selector.tsx` scenery rendering |
| Sections | No formal section object (blocks + notes approximate them) | First-class named, coloured sections spanning blocks, with per-section legend and prices on the buyer map | BETTER | `generate.ts` GeneratedSection; buyer legend `seat-selector.tsx` |
| Rows: counts and uneven rows | Rows with per-row seat counts | Rows with uniform or comma-list per-row counts | EQUAL | `RowsConfig` seats-per-row; unit test "irregular per-row seat counts" |
| Rows: curve / angle | Skew and curve (documented only in their video), rotation | Numeric curve depth (symmetric bow) + rotation in degrees | EQUAL | `generate.ts` curveDepth/rotation; pinned unit tests |
| Rows: alignment / centring | Align control per row | Row alignment select: left-anchored or centred over the widest row (theatre look) | EQUAL (built this pass) | `RowsBlock.align`, builder select; unit test "centres uneven rows" |
| Tables (round / square) | Adjustable seat counts, naming, label direction | Round + square, seat count, label scheme, rotation; table label flows to "Table 1, Seat 3" on tickets | EQUAL | `TableConfig`; `generateTableBlock` |
| Whole-table booking | Packaged-ticket workaround off the map | Map-native "Book a whole table": one tap holds every free seat at the table | BETTER | `seat-selector.tsx` whole-table panel; E2E screenshots |
| Standing zones mixed with seats | Named areas with capacity | Named zones with capacity, sold via their bound GA tier, on the same map | EQUAL | `AreaBlock`; buyer map zones |
| Numbering schemes | Row start letter, seat start, direction, prefixes | Row scheme alpha/numeric with custom start (incl. AA overflow), seat start, reverse direction | EQUAL | `RowsConfig`; unit test "custom numbering" |
| Per-seat label override | Multi-select + override labels | Relabel click-mode tool on rows AND tables (labelOverrides) | EQUAL (built this pass) | `seat-map-builder.tsx` relabel mode; `generate.ts` overrides |
| Batch multi-select editing | Multi-select within one element | Per-seat click tools (one click per seat), no marquee multi-select | EQUAL outcome, more clicks on large edits - noted honestly | `onSeatClick` modes |
| Accessible seats | NOT DOCUMENTED (workarounds only) | First-class accessible + companion seat types, marked in one click, rendered distinctly, individually screen-reader labelled for buyers | BETTER | seat types in `generate.ts`; buyer map states |
| Blocked / held seats | Hide seat, remove seat, private table | Blocked toggle (materialises as blocked), remove seat, organiser holds with reasons (comp/VIP/sponsor...) + notes + release | BETTER | builder modes; `seats/actions.ts` holdSeat/releaseSeat |
| Capacity limits | NOT DOCUMENTED | No generator ceiling; 500-block save guard; read surfaces page to 10,000 seats (documented limit) | EQUAL | `generate.ts` header; `actions.ts` block guard |
| Chart reuse across events | Auto template; ticket mapping redone each event | Venue template; tier binding survives reuse where tier names match | BETTER | `saveSeatMap`; `materialize_seats` name binding |
| Editing after sales begin | Map editable live, NO safeguards documented, buyers not notified | "Sync chart edits" applies additions/repositions with reserved/sold/held seats provably immutable | BETTER | `rematerialize_seats_additive` (migration 20260710000001); Sync button |
| Ticket type / price mapping | Ticket types mapped to blocks or individual seats, capacity warnings with auto-match | Tier bound per section by name (survives template reuse, their acknowledged friction); prices flow live to the buyer map (displayed = charged); a live capacity-coverage check in the wizard warns when the tickets do not cover the chart's seats | EQUAL | `materialize_seats` tier resolution; wizard step 6 capacity check |
| Chart delete | Per-event removal | Chart delete wired in the UI (soft delete; attached events keep their seats), with venue-ownership check | EQUAL (built this pass) | `seat-maps-client.tsx` Delete; hardened `deleteSeatMap` |
| Who can build | Account-level (their team model) | Owner OR organisation members with owner/admin/manager roles (the door-scan trust level) | EQUAL (built this pass) | `src/lib/organisations/access.ts`; gates across seat-maps + seats |

## 2. The attendee experience

| Capability | Reference standard | EventLinqs | Verdict | Our evidence |
|---|---|---|---|---|
| Map interaction | Interactive map at checkout, WebGL required | Interactive SVG map, no WebGL dependency, works with JS-rendered fallbacks | EQUAL | `seat-selector.tsx`; buyer E2E |
| Seat states | Available/unavailable; full legend not documented | Available (section colour), selected (gold brand moment), reserved/sold/held/blocked (quiet ink), accessible (keyline + label), with legend and per-section prices | BETTER | STATUS_FILL + legend |
| Zoom / pan / mobile | NOT DOCUMENTED | Zoom 0.5-2x + fit, native pan and pinch, touch tap-to-select; 1,200-seat performance proof | BETTER (their behaviour undocumented; ours proven) | zoom controls; paging in `events/[slug]/page.tsx` |
| Best available | NOT DOCUMENTED (no auto-allocation) | Best-available picker (1-10): longest contiguous run per row | BETTER | `pickBestAvailable`; UI buttons |
| Buyer-side seat holds | No documented hold timer | Atomic row-locked holds with visible expiry: two buyers can never carry the same seat to payment | BETTER | seat reservation RPC; 2026-07-05 verification doc |
| Table booking UX | Packaged ticket off the map | One tap books the whole table on the map | BETTER | whole-table panel |
| Seat on ticket (with notes) | Seat labels + notes on the digital ticket | Seat AND per-seat organiser note on my-tickets, confirmation and email (HTML + text), plus the seat on the bearer QR page and the door-scan ADMIT panel | BETTER | `lib/seating/format.ts` call sites; seats.note on three buyer surfaces; unit test |
| Growth tie-in | None | Share-your-seat: the confirmation invites friends to pick a seat nearby, attributed | BETTER | confirmation share block |

## 3. Post-sale operations

| Capability | Reference standard | EventLinqs | Verdict | Our evidence |
|---|---|---|---|---|
| Organiser reassignment after purchase | Move any holder via manage attendees; ticket updates; NO notification to the attendee | Move attendee on any sold seat: atomic RPC (old seat freed, new seat sold, ticket repointed), ticket/email/scan reflect immediately, AND the holder is emailed about the change | BETTER (built this pass) | `reassign_ticket_seat` (migration 20260710000001); `reassignSeatOccupant`; E2E proof |
| Buyer self-service seat change | Optional toggle via manage-order | Per-event opt-in (events.allow_seat_self_service); the holder moves themselves to any available seat from /tickets through the same proven reassign path, so the ticket, QR, email and door scan update | EQUAL | `app/actions/self-seat.ts`; `change-seat-control.tsx`; wizard step 6 toggle |
| Door check-in with seat | Seat shown in their scanning app | Seat label on the ADMIT/REJECT scan panel, resolved live so post-move scans show the new seat | EQUAL | `scan_ticket` seat_label; scanner UI |
| Sold vs remaining views | Assigned-tab list; no inventory report documented | Live stats tiles (total/available/held/reserved/sold), status + section filters, room view coloured by live status | BETTER at-a-glance; no CSV export (noted) | `seats-client.tsx` |
| Holds / comps | Hide seats or hidden ticket types; comp via manual order | First-class holds with reasons + notes + release; comp is a hold reason (no comp-ticket mint flow - noted) | EQUAL | hold flow |

## Former remainders (all closed 2026-07-10)

The three rows that were BEHIND in the interim pass are now closed, so the
table above carries zero BEHIND:

1. **Section tier mapping + capacity check.** Re-verdicted EQUAL. Tier binds
   per section by name (which keeps template reuse frictionless, the reference
   standard's acknowledged weakness), and event-form step 6 now shows a live
   capacity-coverage check that warns when the tickets do not cover the
   chart's seats - the same "see issue" signal, without the per-seat mapping
   overhead.
2. **Buyer self-service seat change.** Now EQUAL. A per-event opt-in
   (`events.allow_seat_self_service`, off by default so group adjacency is
   never broken by surprise); when on, the holder moves themselves from
   `/tickets` through the proven `reassign_ticket_seat` RPC, so the ticket,
   QR, email and door scan all reflect the new seat.
3. **Per-seat notes on the ticket.** Now BETTER. A builder "Add note" tool
   writes the note into the chart layout; `materialize_seats` carries it to
   `seats.note`; and it shows on my-tickets, the confirmation and the
   confirmation email, with a pinned unit test on the generator.

Every founder-named gap from the earlier pass (post-sale reassignment,
uneven-row centring, builder access beyond the owner) was already closed, plus
chart delete, per-seat relabel, scenery annotations, and safe live-chart sync.
The seated purchase flow was re-proven end to end after these changes (see the
verification run below).
