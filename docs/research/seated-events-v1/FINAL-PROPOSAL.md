# Seated Events V1: Final Proposal (Phase 3)

Prepared: 17 May 2026
Synthesises `COMPETITOR-SCAN.md` + `DESIGN-DECISIONS.md` into a concrete EventLinqs V1 design. Principle: EXTEND the existing M4 `seat_maps`/`seat_map_sections`/`seats`/`seat_holds`/`reservations` + the pending `tickets.seat_id`/`ticket_scans`. Do not redesign what works. No code is changed here (parent will action).

This is a proposal with trade-offs, not a claim of a perfect design. Recommended option per question is restated with the honest cost.

---

## 1. What already exists (do not rebuild)

- `seat_maps` (venue-scoped, `layout JSONB`, `total_seats`, reusable).
- `seat_map_sections` (`color`, `sort_order`; `ticket_tiers.seat_map_section_id` FK present).
- `seats` (per-event materialised: section/tier/`row_label`/`seat_number`/`seat_type` enum/`status` enum/`x`,`y`/`price_cents`/`reservation_id`/`order_item_id`/`held_by_user_id`/`metadata`; UNIQUE(event_id,row_label,seat_number); indexes on event, event+status, section, tier, reservation).
- `seat_holds` (organiser holds, audited).
- `reservations` (guest or user, `expires_at`, `items JSONB`).
- RPCs: `materialize_seats(event_id, seat_map_id)`, `create_seat_reservation(event_id,user_id,seat_ids[],ttl)` (row-locks `FOR UPDATE`, TTL).
- Enums: `seat_status` (available|reserved|sold|held|blocked|accessible), `seat_type` (standard|premium|accessible|companion|restricted_view|obstructed).
- Pending (per brief): `tickets.seat_id` nullable FK, `ticket_scans`, `issue_tickets_for_order()` + orders AFTER-UPDATE trigger.

The M4 design is ~70% of a reserved-seating system already. The proposal is mostly additive.

## 2. Schema additions / changes (minimal, additive)

All as ONE new forward migration applied via `supabase db push --linked` from PowerShell (per CLAUDE.md - never Dashboard, never MCP apply_migration). `src/types/database.ts` regeneration is a `[SHARED]` Session-2 concern - flag to PM.

2.1 `seat_maps` - add (display-only metadata, no behaviour change):
- `version INT NOT NULL DEFAULT 1` - bump on layout edit; lets a published event pin the version it materialised from (label-drift safety, see 2.6).
- `editor_schema JSONB NOT NULL DEFAULT '{}'` - the generator-friendly editor representation (rows/tables/areas/objects/text). `layout` stays the materialisation input consumed by `materialize_seats`; `editor_schema` is what the canvas reads back to keep editing. Separating them avoids breaking the existing RPC.

2.2 `seat_map_sections` - add:
- `seat_type_default public.seat_type NOT NULL DEFAULT 'standard'` - section-level default applied at materialisation, overridable per seat.
- `entrance_label TEXT` - nearest gate/door for wayfinding on the ticket (Q4/Q6).

2.3 `seats` - add (all nullable, no backfill needed):
- `is_accessible BOOLEAN NOT NULL DEFAULT FALSE`, `is_companion BOOLEAN NOT NULL DEFAULT FALSE` - explicit flags (the `seat_type` enum still carries the primary type; booleans make best-available + filtering cheap and indexable without enum gymnastics). Mirrors Seats.io `isAccessible`/`isCompanionSeat`. `[VENDOR-DOC seats.io]`
- `focal_distance NUMERIC(10,2)` - precomputed distance from the venue focal point (stage), set at materialisation from `x,y`; powers best-available "closest to focal point" without per-request geometry. `[VENDOR-DOC seats.io best-available]`
- Partial index: `CREATE INDEX idx_seats_event_available ON seats(event_id, seat_map_section_id) WHERE status = 'available'` - the hot path for the availability API and best-available.
- (No new accessibility columns beyond the 2 booleans; finer Seats.io taxonomy - lift-up armrests, semi-ambulatory, hearing-impaired, sign-language, plus-size - rides in existing `seats.metadata` JSONB in V2. Reserve those keys by convention now; no schema change later.)

2.4 New table `event_seat_availability_cache` (optional, only if Redis is deemed insufficient) - per-event-per-section counts. PREFER Upstash Redis (already in stack) over a table; list this table only as a fallback if Realtime+Redis is descoped. `[INFERRED]`

2.5 No change to `seat_holds`, `reservations`, `ticket_tiers`, enums, `materialize_seats` signature. `tickets.seat_id` (pending) is sufficient for ticket<->seat linkage; no change requested there.

2.6 Migration strategy from current M4:
- No data migration needed: no production seated events exist yet (M4 tables are defined, the editor/picker were never shipped). This is greenfield on a defined schema - the cheapest possible migration.
- The new columns are all `DEFAULT`/nullable so the migration is non-locking and reversible.
- `materialize_seats` gets a SUPERSET version (new function name or `OR REPLACE` keeping the signature) that ALSO populates `is_accessible`, `is_companion`, `focal_distance`, `seat_type` from `seat_map_sections.seat_type_default` + per-seat overrides in `layout`. Backward compatible: existing `layout` JSON without the new keys still materialises (COALESCE to defaults), exactly as the current function already COALESCEs `type`/`x`/`y`.
- Label-drift safety (the Ticket Tailor failure mode `[VENDOR-DOC]`): tickets bind to `seats.id` (UUID), never to label. The current `materialize_seats` does `DELETE FROM seats WHERE event_id = ...` then re-inserts - SAFE only before sales. Add a guard: refuse re-materialisation if any seat for the event is `sold` or has an `order_item_id`/`reservation_id` (raise a clear exception). This closes the exact double-book hole Ticket Tailor documents.

## 3. Component architecture

Feature code only (Session 3 owns marketing/admin polish; the seated buyer flow + organiser editor are event-domain - confirm ownership with PM before building, this is a cross-cutting feature, likely a coordination item).

Organiser side:
- `SeatMapEditor` (canvas shell) - reads/writes `seat_maps.editor_schema`, serialises to `layout` on save.
  - `RowBlockTool`, `TableTool` (round/square), `AreaTool` (GA), `AnnotationTool` (stage/bar/exit objects + text).
  - `SelectTool` with multi-select; `DuplicateAction`, `MirrorAction` (Ticket Tailor pattern).
  - `FloorplanBackgroundLayer` - non-interactive traced image (`layout.background`), no auto-detect in V1.
  - `TierMappingPanel` - assign `ticket_tier` to section / multi-selected seats; live capacity-reconciliation banner (Humanitix "see issue" + auto-match).
  - `SeatInspector` - per-seat type (accessible/companion/restricted/obstructed), price override, hide/remove.
- `SeatHoldsPanel` - organiser holds via existing `seat_holds` (reason/notes).
- `AttendeeSeatReassign` - move attendee, triggers comms (Q8).

Buyer side (all media via `@/components/media`, no raw img, per CLAUDE.md):
- `SeatPicker` (orchestrator) - chooses render mode by scale (Q3/Q7).
  - `SectionOverview` - SVG section polygons coloured by tier, availability heat from the availability API.
  - `SectionSeatView` - drill-in; SVG for <= ~1,500 seats, `CanvasSeatLayer` for the rare larger single section.
  - `BestAvailableCta` - primary path: quantity + optional accessible count -> calls best-available RPC.
  - `SeatList` - the accessible/screen-reader equivalent surface, two-way synced with the map (SeatGeek list<->map sync, doubles as a11y compliance - Q5).
  - `SelectionBottomSheet` - sticky, running ALL-IN total (reuses the existing all-in price work, `[ON-FILE]` requirement), hold-timer aria-live countdown.
- `SeatedTicket` - section/row/seat string + tier + accessibility chip + static `SectionMiniMap` + per-seat QR; `PartyCard` groups a multi-seat order.

Server / data:
- `GET /api/events/:id/seat-availability` - per-section aggregate counts (Redis-cached, invalidated on hold/book/refund).
- `GET /api/events/:id/sections/:sid/seats` - one section's seats + status.
- Postgres `reserve_best_available(event_id, user_id, qty, accessible_qty, tier_ids[], ttl)` - SECURITY DEFINER, `FOR UPDATE` locking, simplified Seats.io ladder.
- Postgres `expire_stale_seat_reservations()` - sibling of the existing `expire_stale_squads`, frees seats whose `reservations.expires_at` passed.
- Supabase Realtime channel on section-count deltas (or `seats` filtered by `event_id`) -> live picker updates.
- Refund/transfer hooks: on refund, transactional seat release + cache invalidation + Realtime emit; on transfer, no seat change.

## 4. Organiser seat-map creation flow

1. Organiser opens an event -> "Seating" -> reuse an existing venue chart (`seat_maps` for that venue) OR create new (Humanitix/Seats.io reuse pattern; only layout copies, tiers are per-event).
2. Canvas: add Row block(s) (rows count, seats/row, label scheme, optional curve preset), Table(s), Area(s); annotate stage/bar/exits; optionally upload a floorplan image to trace over. Duplicate/Mirror for symmetric bowls (target: 100-seat hall < 1 min, 5,000-seat < 30 min, no vendor-build step - beats ThunderTix's human-built model).
3. Map tiers: assign each `ticket_tier` to a section (uses existing FK); override price/type on multi-selected seats; mark accessible/companion/obstructed/restricted seats.
4. Reconciliation gate: cannot publish while any tier capacity != mapped seat count (Humanitix guard) - blocking, with auto-match assist.
5. Publish -> `materialize_seats` (superset version) writes `seats`; version pinned; re-materialisation blocked once any seat is sold/held (label-drift safety, 2.6).

## 5. Buyer selection flow

1. Event page: seated event shows "From $X" + "Choose your seats" (all-in transparency per `[ON-FILE]`).
2. Default CTA "Find the best N seats together" (qty stepper + optional "I need N wheelchair-accessible"). Secondary "Pick on the map".
3. Best-available -> `reserve_best_available` returns adjacent same-tier seats (accessible honoured), creates a `reservations` row + flips `seats` to `reserved` with TTL (existing mechanism). OR manual: SectionOverview -> drill into a section -> tap seats (or use the synced SeatList for keyboard/screen-reader). Mixed GA+seated: GA shows as an Area quantity alongside sections (nullable `tickets.seat_id` already supports this).
4. SelectionBottomSheet shows seats + running all-in total + live hold countdown; Realtime greys seats others take.
5. Checkout: existing reservation -> order -> on payment, `issue_tickets_for_order()` (pending) sets `tickets.seat_id`, seats -> `sold`. Identical to GA checkout except `seat_id` is populated.
6. Confirmation/email: `SeatedTicket` + `PartyCard`, static section mini-map, per-seat QR.

## 6. Seated scan flow

- One QR per `tickets` row (no seated-specific QR). Scanner validates via `ticket_scans`: belongs to this event, valid status, not already scanned (idempotent re-scan returns prior result, never double-admits). Returns seat string + `seat_type` for the usher.
- Wrong section: if scanner bound to a gate and ticket's `seat_map_section_id` differs -> non-blocking "Different section: direct to <section>" + staff "admit anyway" (never auto-reject a valid ticket; community staffing is flexible).
- Offline: pre-cache event's valid ticket IDs + seat strings; queue offline scans; reconcile + authoritative dedupe on reconnect.

## 7. Implementation sequence (with honest per-step estimates)

Estimates are engineering-days for one focused engineer, assuming the pending `tickets`/`ticket_scans`/`issue_tickets_for_order` layer lands first (it is a stated dependency - if not present, add ~3-5 d to build it; coordinate with the payments/backend session). Estimates are `[INFERRED]` ranges, not commitments.

| # | Step | Est (d) | Risk |
|---|---|---|---|
| 0 | Confirm cross-session ownership of seated feature with PM (event domain spans sessions) | 0.5 | Coordination blocker if skipped |
| 1 | Forward migration: §2 additions; superset `materialize_seats`; re-materialise guard | 2-3 | LOW (additive, greenfield) |
| 2 | `reserve_best_available` Postgres fn (simplified Seats.io ladder) + tests | 3-4 | MED (concurrency; mirrors proven reservation RPC) |
| 3 | `expire_stale_seat_reservations` fn + schedule (clone `expire_stale_squads`) | 1 | LOW |
| 4 | Availability API + Redis cache + invalidation hooks | 2-3 | MED |
| 5 | Supabase Realtime wiring (section-count deltas to picker) | 2 | MED |
| 6 | Organiser editor canvas: Row/Table/Area + objects/text + Duplicate/Mirror + floorplan bg | 8-12 | HIGH (largest single item) |
| 7 | Tier mapping panel + capacity reconciliation gate | 2-3 | LOW-MED |
| 8 | Accessibility marking in editor + best-available `accessible` param | 1-2 | LOW |
| 9 | Buyer picker: SectionOverview + SectionSeatView (SVG; Canvas for large single section) | 5-7 | HIGH |
| 10 | Best-available CTA + SelectionBottomSheet + all-in total reuse | 2-3 | MED |
| 11 | Accessible SeatList + two-way map sync (a11y compliance + mobile fallback) | 3-4 | MED (do not cut) |
| 12 | SeatedTicket + PartyCard + static SectionMiniMap generator + email/PDF | 3-4 | MED |
| 13 | Scan flow: section binding, wrong-section soft warning, offline cache/reconcile | 3-4 | MED |
| 14 | Edge cases: refund-release (transactional+invalidate), transfer-keeps-seat, organiser reassign+comms, partial-group refund | 3-4 | MED |
| 15 | E2E + 7-viewport visual + competitive Playwright + Lighthouse>=95 + axe (per Definition of Done) | 4-5 | MED |

Indicative total: ~50-70 engineering-days. The editor (6) and picker (9) are ~25% of the build and the schedule risk; everything server-side leans on proven M4 patterns and is lower risk.

## 8. Explicit V1 deferrals (require PM sign-off per CLAUDE.md - no silent deferral)

- 10,000+ seats / true single mega-section / Mapbox-style tiled rendering -> V2. V1 caps at 10,000 total but never renders them at once; a single section > ~1,500 seats uses Canvas as a stopgap, not a true mega-venue solution.
- 3D / isometric venue views (Ticket Tailor offers a 3D sections view `[VENDOR-DOC]`) -> V2. V1 is 2D top-down only.
- Advanced editor: curved/raked sightline geometry beyond simple presets, auto-seat-detection from a traced floorplan image, seat-view photography per seat (SeatGeek `[SCRAPED]`) -> V2 (reserve `seats.metadata` keys + `layout.background` now).
- Finer accessibility taxonomy (lift-up armrests, semi-ambulatory, hearing-impaired, sign-language, plus-size; routed wayfinding) -> V2 via `seats.metadata` (no schema change needed later).
- Buyer self-service seat change post-purchase (DICE `[VENDOR-DOC]`) -> V2; V1 is organiser-initiated reassignment only.
- Tables/booths bookable-as-a-unit and multi-floor best-available steps (Seats.io steps 5-6 `[VENDOR-DOC]`) -> V2; V1 best-available handles seats + GA only.
- Build-vs-buy: Universe deliberately bought (Seats.io) rather than built `[VENDOR-DOC]`. V1 recommendation is BUILD (the M4 schema + concurrency core already exist, and a third-party engine conflicts with owning the data/RLS/no-extra-fee positioning), but an honest fallback if step 6/9 slips: a time-boxed embeddable engine for the editor only is a contingency to raise with the PM, not a V1 plan.

## 9. Strongest pattern to borrow / biggest mistakes to avoid

Borrow (highest confidence, multi-source): the Seats.io model end-to-end - reusable chart, per-event availability, hold-then-book-before-payment, the documented best-available step ladder, per-seat accessible/companion flags + `accessibleSeats` group param. It maps almost 1:1 onto existing M4 (`seat_maps` reusable, `seats` per-event, `create_seat_reservation` = hold, `seat_status`/`seat_type` enums already present). `[VENDOR-DOC seats.io x3]`

Avoid (each evidenced):
- Ticket Tailor label-as-foreign-key drift (editing a live chart orphans paid tickets) `[VENDOR-DOC]` -> bind to `seats.id` UUID + block re-materialisation after first sale.
- ThunderTix vendor-builds-your-chart model `[VENDOR-DOC]` -> must be instant self-serve (EventLinqs no-gatekeeping promise `[ON-FILE]`).
- Any seat-map surcharge (Ticket Tailor 2x usage, ThunderTix $250+ setup, SeatLab "additional costs") `[VENDOR-DOC x3]` -> include free; weaponise it in the comparison table.
- Ticketmaster/AXS/DICE sales/partner gate + app-wall for seated `[VENDOR-DOC]` `[ON-FILE]` -> web-first, self-serve, WhatsApp-native.
- Skipping the accessible seat model because competitors' public docs are thin `[SCRAPED]` -> the bar is LOW; leading here is cheap and on-brand. The screen-reader equivalent list is non-negotiable and conveniently doubles as the mobile/low-memory fallback.
