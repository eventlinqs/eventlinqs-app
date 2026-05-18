# Seated Events: Design Decisions (Phase 2)

Prepared: 17 May 2026
Inputs: `COMPETITOR-SCAN.md` (this folder), the existing M4 schema in `supabase/migrations/20260101000001_baseline_schema.sql`, `[ON-FILE]` Phase 1.3/1.4 intel.
Constraints (locked by brief): V1 up to 10,000 seats/event (10k+ is V2). Mobile-first. Accessibility not an afterthought. AU venues 100 to ~5,000 seats. AU English, no em-dashes, no exclamation marks.

## Existing M4 foundation (the thing we extend, not redesign)

From `20260101000001_baseline_schema.sql`:

- `seat_maps` (venue-scoped, `layout JSONB`, `total_seats`, `is_active`) - reusable per-venue chart definition.
- `seat_map_sections` (`seat_map_id`, `name`, `color`, `sort_order`) - sections; `ticket_tiers.seat_map_section_id` FK already exists.
- `seats` (materialised PER EVENT: `event_id`, `seat_map_section_id`, `ticket_tier_id`, `row_label`, `seat_number`, `seat_type` enum, `status` enum, `x`, `y` NUMERIC, `price_cents`, `reservation_id`, `order_item_id`, `held_by_user_id`, `held_reason`, `metadata JSONB`; UNIQUE(event_id,row_label,seat_number)).
- `seat_holds` (organiser-held seats: event/seat/user/reason/notes).
- Enums: `seat_status` = available|reserved|sold|held|blocked|accessible; `seat_type` = standard|premium|accessible|companion|restricted_view|obstructed.
- RPCs: `materialize_seats(event_id, seat_map_id)` walks `layout.sections[].rows[].seats[]` and inserts `seats` rows; `create_seat_reservation(event_id,user_id,seat_ids[],ttl)` row-locks `FOR UPDATE`, verifies `available`, writes a `reservations` row (`items` JSONB carries `seat_ids`), flips seats to `reserved` with `reservation_id` + TTL.
- `reservations` table already supports guest (`session_id`) or user, `expires_at`, `status`.
- Pending (per brief, not yet on this branch): `tickets.seat_id` nullable FK to `seats`, `ticket_scans`, `issue_tickets_for_order()` + orders AFTER-UPDATE trigger.

This is a strong, near-complete spine. Most decisions below are "extend M4", not "build new".

---

## Q1. Seat-map editor for organisers

What competitors do:
- Drag-drop browser canvas with primitives is the credible self-serve norm: Humanitix (round table / square table / rows / area + objects + text), Eventbrite ("Seating Chart Maker", drag-drop, sections/rows/tables/objects), Ticket Tailor (Row / Multiple Rows / Rows-with-Segments / Mirror / Duplicate / trace-a-floorplan-image), Seats.io Designer (point/click/drag, trace reference image, reusable chart). `[VENDOR-DOC x4]`
- Vendor-builds-it-for-you (ThunderTix: submit a labelled PDF/CAD, their team builds it, edits cost money) is the explicit anti-pattern for a no-gatekeeping platform. `[VENDOR-DOC]`
- Ticket Tailor's own data point: "the overwhelming majority of seated events ... Simple chart ... generally < 1,000 seats"; sections only needed > 1,000. `[VENDOR-DOC]` This says the 100-seat community case is the common case and must be the fast path.

Trade-offs:
- Pure freeform drag-drop (per-seat) = maximal fidelity, slow for a 5,000-seat venue, heavy editor build.
- Grid row x col generator = a 100-seat hall in 20 seconds; cannot express curved/raked/odd venues.
- Templates (pre-built AU venue charts) = best org experience, but requires a seeded chart library EventLinqs does not have at launch.
- Floorplan-image overlay (trace) = handles any odd venue, needs an image upload + tracing UX (medium build).
- Hybrid (generators that emit editable elements) = Humanitix/Ticket Tailor pattern; best effort/coverage ratio.

EventLinqs V1 recommendation: Hybrid, generator-first. A browser canvas with three add primitives that EXPAND into editable seats, matching the existing `layout JSONB` -> `materialize_seats` shape:
1. Row block: enter rows (count or A.. labels), seats-per-row, label direction, curve angle (0 = straight; small set of presets). Emits `section -> rows[] -> seats[]` with computed `x,y`.
2. Table: round/square, N seats, prefix. Emits a section with one "row" per table.
3. Area (GA/standing): a capacity number, no per-seat coordinates (uses existing `seats.metadata` or a GA tier, not individual seats).
Plus: object/text annotations (stage, bar, exits) stored in `seat_maps.layout.objects[]` (display-only, never materialised into `seats`); Duplicate + Mirror tools (Ticket Tailor pattern, cheap, huge time saver for symmetric 5,000-seat bowls); optional floorplan-image as a non-interactive background layer to trace against (store URL in `layout.background`, do NOT auto-detect seats in V1).
Reuse: `seat_maps` is venue-scoped already - a chart built once is reusable across that venue's events (Humanitix/Seats.io pattern). Copy only layout; tier mapping is per-event (Q2).
Both ends of the range: 100-seat community = one Row block + one Table type, < 1 min. 5,000-seat = sections + Row blocks + Duplicate/Mirror, target < 30 min (no vendor-build step).

Complexity: HIGH (the canvas is the single biggest V1 build). Mitigation: generator-first means the data model is `layout JSONB` which `materialize_seats` already consumes; the editor is "produce that JSON", reducing risk.

## Q2. Tier-to-seat mapping

What competitors do:
- Ticket Tailor: every seat in a Category; Category = colour + price; one Category, multiple ticket types/prices; multiple categories per section. `[VENDOR-DOC]`
- Humanitix: separate "mapping" tab; select block/table, assign valid ticket types; multiple ticket types per seat, seat sells once; "see issue" warning + auto-match when tier capacity != mapped seat count. `[VENDOR-DOC]`
- Eventbrite: tiers added to sections, charge more per area. `[VENDOR-DOC]`

Trade-offs: section-level mapping (assign a tier to a whole section) is fast and matches AU community reality (Stalls/Circle). Per-seat tier override is needed for edge cases (front-row premium within Stalls). Pure per-seat mapping is too slow at 5,000 seats.

EventLinqs V1 recommendation: section-first with per-seat override, reusing existing columns. `seat_map_sections.color` is the visual tier colour. Map a `ticket_tier` to a section (the FK `ticket_tiers.seat_map_section_id` already exists) -> all seats in that section inherit `seats.ticket_tier_id` + `seats.price_cents` at materialisation. Multi-select tool overrides `ticket_tier_id`/`price_cents` on individual seats (Humanitix multi-select pattern). Adopt Humanitix's capacity-reconciliation guard: a server check that `COUNT(seats WHERE ticket_tier_id = T)` reconciles with tier capacity, surfaced as a blocking "fix this" before publish (prevents the classic seated oversell). Free events: a free tier maps the same way; `price_cents = 0`; zero platform fee rule from the Pricing Service is unaffected.

Complexity: LOW-MEDIUM (columns exist; work is the mapping UI + the reconciliation check).

## Q3. Buyer seat picker UX

What competitors do:
- 2D pan/zoom for small/mid; section-first drill-down for large (SeatGeek pan/zoom/drill-in + hover-dim-the-rest + list<->map sync; Ticketmaster tap-section-then-zoom). `[SCRAPED]` `[VENDOR-DOC]`
- Best-available auto-assign as the default-good path, manual optional (Eventbrite default, DICE per-event toggle, SeatLab one-click CTA, Seats.io algorithm). `[VENDOR-DOC x4]`
- Group-together: Seats.io best-available keeps a group on the same row, adjacent, no orphans. `[VENDOR-DOC]`

Trade-offs: forcing manual seat-picking on a phone for a 5,000-seat bowl is hostile; best-available-first is higher-conversion and the documented norm. But community organisers (gala, church) and many buyers WANT to pick. Adaptive default by scale is the resolution.

EventLinqs V1 recommendation: adaptive, best-available-first, manual always available.
- Default CTA: "Find me the best N seats together" (Seats.io step ladder, simplified - see Q7/Q10). Secondary: "Choose seats on the map".
- <= ~600 seats OR a single section: render the full interactive 2D map (pan/zoom), seats individually selectable; this covers the AU 100-seat community case richly.
- Larger / multi-section: section-first - tap a section -> zoom to that section's seats only (never render 5,000 interactive seats at once on a phone; see Q7). Section overview shows price + availability heat (Ticketmaster's darker-blue-more-available legend, simplified).
- Group-together: a quantity stepper first; best-available returns N adjacent seats in one row with no orphans (Q10 algorithm). Manual selection enforces same-tier rules and warns on orphan creation but does not hard-block (organiser community events often want freedom).
- Mobile specifics: list<->map sync (SeatGeek) so the small map is navigable; selected seats summarised in a sticky bottom sheet with running all-in total (ties to `[ON-FILE]` all-in-price requirement); 44px min touch targets (CLAUDE.md), seats below ~24px visual size are only reachable via section zoom, never tap-targeted directly.
- 10k perf: see Q7/Q10. Picker never holds 10k interactive nodes; availability comes from the server, not a client scan.

Complexity: MEDIUM-HIGH (two render modes + best-available + mobile bottom sheet). The all-in total panel is shared with existing checkout work.

## Q4. Ticket display for seated

What competitors do:
- Humanitix: seat label (section/row/seat per chart labelling rules) on the digital ticket + attendee report. `[VENDOR-DOC]`
- DICE: assigned seat shown in confirmation + app; "Change Seats" button in confirmation email. `[VENDOR-DOC]`
- Ticket Tailor: seat bound by label; per-table sale means no individual tickets per guest (whole-table model). `[VENDOR-DOC]`

EventLinqs V1 recommendation: derive display from existing columns. `tickets.seat_id` (pending) -> join `seats` for `seat_map_section_id` (-> section name), `row_label`, `seat_number`, `seat_type`. Display block: "Section <name> | Row <row_label> | Seat <seat_number>" plus a tier badge and, if `seat_type` in (accessible, companion, restricted_view, obstructed), an explicit labelled chip (accessibility/wayfinding honesty). Mini-map: a static, non-interactive thumbnail of the section with the buyer's seat highlighted (render from `layout` + the seat's `x,y`; cache as the chart rarely changes). Multi-ticket grouping: one order with N seated tickets renders a grouped card "Your party: Row J 12-15" with each seat's QR individually (each `tickets` row keeps its own scan identity - required for the scan flow Q6). Web: full interactive context. Email/PDF: static section mini-map + text seat string + per-seat QR (no JS); follow DICE's "change seat" affordance only if organiser allows reassignment (Q8). Wayfinding V1 = section name + nearest entrance text if the organiser added an `entrance` object; full route maps are V2.

Complexity: LOW-MEDIUM (mostly a render off existing/pending columns; the static mini-map generator is the only new asset).

## Q5. Accessibility

What competitors do:
- Strong public evidence only from ThunderTix (ADA-aligned, wheelchair selectable like any seat, hover wheelchair icon, companion seats, obstructed flagged) and Seats.io (per-seat Accessible/Companion flags or an Accessible category; rich response taxonomy: isAccessible, isCompanionSeat, hasLiftUpArmrests, isHearingImpaired, isSemiAmbulatorySeat, hasSignLanguageInterpretation, isPlusSize, hasRestrictedView, entrance, floor; `accessibleSeats: N` in best-available). `[VENDOR-DOC x2]`
- Humanitix / Eventbrite / Ticket Tailor public docs scanned do NOT evidence an accessible-seat model - so the competitive bar is LOW and EventLinqs can lead cheaply. Honest gap, not an assumption of parity.

EventLinqs V1 recommendation (the existing enums already lean in - use them):
- `seat_type` already has `accessible`, `companion`, `restricted_view`, `obstructed`; `seat_status` already has `accessible`. V1 minimum: editor lets the organiser mark seats as accessible/companion/restricted_view/obstructed (multi-select, Seats.io pattern); picker renders a wheelchair glyph on accessible seats and a labelled note on obstructed/restricted; companion seats are reservable only adjacent to an accessible seat in the same booking (server rule).
- Best-available accepts an `accessible: N` parameter (Seats.io `accessibleSeats` pattern) returning N accessible + the rest standard, kept together.
- Screen-reader picker (V1, not optional): the map is decorative; the ACCESSIBLE primary path is a structured, keyboard-navigable list/combobox - "Section Stalls, Row J, Seat 12, $45, available, wheelchair accessible" - that performs the same booking. This is a deliberate dual-surface (visual map + equivalent semantic list), aria-live for hold timer, focus management on selection. The list<->map sync from Q3 makes this almost free.
- Accessibility holds: organisers can place accessible seats in `seat_holds` with `reason` (e.g. "ADA hold until 7 days out") and release later (Q8).
- V1 minimum vs V2: V1 = the 4 existing seat_types + companion-adjacency rule + screen-reader list + accessible best-available + accessibility holds. V2 = the finer Seats.io taxonomy (lift-up armrests, semi-ambulatory, hearing-impaired, sign-language, plus-size) via `seats.metadata` JSON (no schema change needed - reserve the keys now), and routed wayfinding.

Complexity: MEDIUM. The screen-reader equivalent list is the part teams skip; here it doubles as the mobile fallback so it earns its cost.

## Q6. Seated scan flow

What competitors do: thin public evidence. DICE: assigned seat in app/confirmation; scan flow not publicly detailed. `[ESTABLISHED-PRACTICE]` industry norm: same QR as GA, server validates seat + event + not-already-scanned; door/section mismatch is a soft warning, not a hard block (staff override).

EventLinqs V1 recommendation: one QR per `tickets` row (no seated-specific QR). On scan, `ticket_scans` (pending audit table) records the scan; server validates: ticket belongs to this event, status valid, not previously scanned (idempotent - re-scan returns the prior result, never double-admits), and returns the seat string + `seat_type`. Wrong-door: if the scanner is bound to a gate/section and the ticket's `seat_map_section_id` differs, return a non-blocking "Different section: send to <section>" with an explicit staff "admit anyway" (community events have flexible staffing; never auto-reject a valid ticket). Offline: scanner caches the event's valid ticket IDs + seat strings before doors; offline scans queue and reconcile on reconnect; duplicate detection is best-effort offline and authoritative on sync (the existing scan-audit pattern supports this). Seat is displayed to the usher on a successful scan so they can direct the patron (doubles as wayfinding).

Complexity: MEDIUM (mostly the existing/pending scan layer plus a section field on the scanner session and offline cache).

## Q7. Performance at 10k

What competitors do: only SeatGeek states it publicly - in-house maps, scalable across thousands of venues, "compatibility with technologies like Mapbox, canvas and SVG". `[SCRAPED]` No competitor publishes perf numbers; section-first drill-down at large scale is universal (Ticketmaster, SeatGeek). Everything else here is `[ESTABLISHED-PRACTICE]`/`[INFERRED]`, not a benchmarked competitor figure - stated honestly.

Trade-offs (render tech):
- SVG/DOM: 10,000 nodes is too many for a phone (layout/paint/memory blowup). Fine up to ~1-2k. `[ESTABLISHED-PRACTICE]`
- HTML elements: worse than SVG at scale.
- Canvas (2D) with hit-testing: handles 10k+ smoothly, but accessibility must come from a parallel semantic model (we already mandated the screen-reader list in Q5, so this cost is paid).
- Mapbox-style tiling: only needed for true mega-venues (V2 10k+).

EventLinqs V1 recommendation:
- Render-on-demand by zoom level. Zoomed out = sections as a handful of SVG polygons coloured by tier with an availability heat (server-aggregated counts, not per-seat). Drill into a section = render only that section's seats. A single section is realistically <= ~1,500 seats even in a 5,000-seat AU venue, which SVG handles. So V1 never renders 10k interactive seats simultaneously.
- For the rare large single-section view, use Canvas with click hit-testing; the semantic list (Q5) is the accessible+fallback path.
- Availability is SERVER-side: an availability endpoint returns per-section counts (cheap, indexed: `idx_seats_event_status` already exists) and, on drill-in, the seat list for ONE section with status. Client never scans 10k rows.
- Caching: section-aggregate availability cached in Redis (Upstash, already in stack) with short TTL + invalidation on hold/book; the static chart geometry (`seat_maps.layout`) is immutable per version and cached hard (CDN/edge).
- Mobile data/memory budget (`[INFERRED]` targets, not competitor-benchmarked): initial seated payload < 150 KB (sections + counts, not seats); one section drill-in < 300 KB; keep < ~2,000 live DOM/Canvas nodes at any time; first interactive < 2.5 s on mid mobile warmed (aligns with the locked Lighthouse >= 95 standard, measured per the no-localhost rule).

Complexity: HIGH (the render-on-demand + availability API is the core scale work) but de-risked because the existing `seats` indexes and per-event materialisation already support per-section queries.

## Q8. Edge cases

`[ESTABLISHED-PRACTICE]` plus existing schema affordances. V1 rules:
- Transfer keeps seat: a ticket transfer reassigns ownership; `tickets.seat_id` is unchanged; the seat is NOT released. Confirmation to new holder shows same seat.
- Refund releases seat: refunding a seated ticket sets the seat back to `available`, clears `reservation_id`/`order_item_id`/`held_by_user_id`, returns it to inventory. Must be transactional with the refund (idempotent, per CLAUDE.md payment rules) and emit a real-time availability invalidation (Q7 cache).
- Organiser reassignment + comms: organiser moves an attendee to a different seat (Humanitix has this `[VENDOR-DOC]`). Server moves `seat_id`, frees old seat, marks new seat sold, writes an audit row, and triggers a notification (email/WhatsApp) "Your seat changed: now Row J 14" with the updated mini-map (Q4). DICE's confirmation-email "change seats" affordance is the inspiration; V1 = organiser-initiated only, buyer self-change is V2.
- Partial group refund: refund 2 of 4 seats - only those 2 seats release; remaining 2 keep their seat_ids and QRs; party card (Q4) re-renders to the surviving seats.
- Accessibility holds: accessible seats parked in `seat_holds` (reason) and not offered to general best-available until released; `accessibleSeats` best-available may still draw from a designated accessible pool the organiser leaves open.
- VIP perks: VIP is a tier (section colour + price); perks (lounge, parking) ride as order add-ons, not seat attributes; `seats.metadata` can carry a `perk` note for the ticket display without a schema change.
- Mixed standing + seated: one event has GA tiers (no `seat_id`, `tickets.seat_id` nullable - already supported by the pending schema) AND seated tiers (with `seat_id`). The picker shows GA as an Area (quantity only) alongside selectable sections. This is explicitly supported by `tickets.seat_id` being nullable - no change needed.

Complexity: MEDIUM. All are expressible on existing columns; the work is transactional correctness (refund/seat release) and the reassignment notification.

## Q9. Pricing model

What competitors do: Ticket Tailor charges an extra metered "usage" per seat reservation (paid seated ticket = 2 fees). ThunderTix charges a one-time setup fee ($250 / up to 450 seats; $0.55/seat above). SeatLab hedges "additional costs may apply". Humanitix and Eventbrite show NO separate seat-map surcharge on scanned public pages. `[VENDOR-DOC x5]` `[ON-FILE]`

Trade-off: a seat-map surcharge is real margin but directly contradicts EventLinqs' strongest positioning - "free events are free, forever", "keep more", the cheapest credible per-ticket economics, and the no-hedging mandate (`[ON-FILE]` _ANALYSIS.md sections F1, G3, K1).

EventLinqs V1 recommendation: NO separate seat-map fee. Seated events use the same single transparent fee as any paid event; free seated events (gala RSVP, church) remain $0, unconditional (consistent with the Pricing Service zero-fee-on-free rule in CLAUDE.md). This is itself a competitive weapon: a comparison row "seat maps included free vs Ticket Tailor 2x usage / ThunderTix $250+ setup" is honest and devastating, exactly the play `[ON-FILE]` recommends. Revisit only if seat-map abuse (giant charts on tiny events) becomes a real cost; even then prefer fair-use limits over a fee.

Complexity: LOW (a pricing decision, not a build; the Pricing Service stays the single source of truth, untouched).

## Q10. Technical architecture for 10k

What competitors do: Seats.io is the public reference - chart designed once, an "event" tracks availability and is reusable across performances, real-time push to all viewers, hold-token then book-before-payment, documented best-available step ladder. `[VENDOR-DOC x2]` This maps almost 1:1 onto existing M4.

EventLinqs V1 recommendation: extend M4, do not redesign (full schema in FINAL-PROPOSAL).
- Schema vs existing `seats`: keep `seats` as the per-event materialised source of truth. It already has status/tier/section/coords/hold/order linkage and the right indexes (`idx_seats_event_status`, `idx_seats_section`, `idx_seats_tier`, `idx_seats_reservation`). Additions are minimal (a small set of nullable columns + a section-availability helper), NOT a new model.
- Availability API: server endpoint `GET /events/:id/seat-availability` -> per-section aggregate counts (uses `idx_seats_event_status`), cached in Upstash with hold/book invalidation. Drill-in: `GET /events/:id/sections/:sid/seats` -> seat list for ONE section only.
- Real-time holds vs `seat_holds`: distinguish two concepts. `seat_holds` = ORGANISER inventory holds (long-lived, audited) - keep as-is. BUYER transient holds = the existing `create_seat_reservation` RPC + `reservations.expires_at` TTL + `seats.status='reserved'`/`reservation_id` - this is the hold-before-payment mechanism (Seats.io's holdToken equivalent already exists). Add a Postgres function to expire stale seat reservations (mirror the existing `expire_stale_squads` pattern) so abandoned carts free seats. Real-time UI updates: Supabase Realtime on `seats` filtered by `event_id` (or a lighter section-counts channel) pushes availability deltas to open pickers - Seats.io's "push to all viewers" behaviour, achievable on the existing stack.
- Best-available: a SECURITY DEFINER Postgres function (sibling to `create_seat_reservation`) implementing a SIMPLIFIED Seats.io ladder for V1: (1) N adjacent in one row, same tier, no orphans, nearest focal point; (2) same row, orphans allowed; (3) N nearest any row same tier; (4) across sections; fail -> clear error. `accessibleSeats` param honoured. Tables/booths/multi-floor steps are V2. Row-locks `FOR UPDATE` exactly like the existing reservation RPC (concurrency-safe under the locked tens-of-thousands-concurrent-buyers target).
- Perf budgets / mobile / memory: as Q7 (server-side availability, render-on-demand, < 150 KB initial, never 10k live nodes, Lighthouse >= 95 measured warmed per the no-localhost rule).
- Browser memory: Canvas only for the rare large single-section; SVG elsewhere; semantic list is the accessible + low-memory path.

Complexity: HIGH overall, but the high-risk concurrency core (locking, reservation TTL, materialisation) ALREADY EXISTS in M4 and is proven by the squads/reservations pattern. Net new server work is the availability API, the expire-stale-seat-reservations function, the best-available function, and Realtime wiring.

---

## Decision summary (recommended option + complexity)

| Q | Recommendation | Complexity |
|---|---|---|
| 1 Editor | Hybrid generator-first canvas (row/table/area + objects + duplicate/mirror + trace-image bg), emits existing `layout JSONB` | HIGH |
| 2 Tier mapping | Section-first (existing `seat_map_sections.color` + `ticket_tiers.seat_map_section_id`) + per-seat override + Humanitix capacity guard | LOW-MED |
| 3 Buyer picker | Adaptive: best-available-first default; full 2D map <= ~600 seats/single section; section-first drill-down larger; list<->map sync; sticky all-in total | MED-HIGH |
| 4 Ticket display | Render off `tickets.seat_id`+`seats`; section/row/seat string, tier + accessibility chips, static section mini-map, grouped party card, per-seat QR | LOW-MED |
| 5 Accessibility | Use existing `seat_type` enum; companion-adjacency rule; screen-reader equivalent list (also mobile fallback); accessible best-available; accessibility holds; finer taxonomy via `metadata` in V2 | MED |
| 6 Scan | One QR/ticket; server seat+event+dedupe validation via `ticket_scans`; wrong-section soft warning + staff override; offline cache + reconcile | MED |
| 7 Perf 10k | Render-on-demand by zoom; sections as polygons + server availability heat; drill-in one section; Canvas only for large single section; Redis-cached aggregates; never 10k live nodes | HIGH |
| 8 Edge cases | Transfer keeps seat; refund releases (transactional+invalidate); organiser reassign+notify; partial-group refund; accessibility holds; VIP=tier+addons; mixed GA/seated via nullable `seat_id` | MED |
| 9 Pricing | NO seat-map surcharge; same single transparent fee; free seated stays $0; use it as a comparison-table weapon | LOW |
| 10 Architecture | Extend `seats`/`reservations`/`seat_holds`; availability API + Redis; buyer holds via existing reservation RPC+TTL; new expire-stale + best-available Postgres fns; Supabase Realtime push | HIGH |

No "perfect solution" is claimed. The biggest honest risks: (a) the editor canvas is a large build and the main schedule risk; (b) public accessibility/perf evidence from competitors is thin, so EventLinqs' bar is set from Seats.io established-practice and the locked internal standards, not a benchmarked competitor number; (c) "10,000 seats" V1 is only safe because the design never renders them all at once - if a true single 10k section is needed, that is effectively V2 territory.
